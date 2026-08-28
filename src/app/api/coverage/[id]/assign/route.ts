// =====================================================================
// API: /api/coverage/[id]/assign — POST (assign a replacement)
//   Transactional: updates coverage request + creates a new StaffShift
//   for the replacement staff, and notifies both staff.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { detectShiftOverlap } from "@/lib/shift-engine";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COVERAGE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { replacementStaffId, overrideConflicts } = body;

  if (!replacementStaffId) {
    return NextResponse.json({ error: "replacementStaffId is required" }, { status: 400 });
  }

  const coverage = await db.coverageRequest.findUnique({ where: { id } });
  if (!coverage || coverage.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (coverage.status === "fulfilled" || coverage.status === "cancelled") {
    return NextResponse.json({ error: `Cannot assign a coverage in status '${coverage.status}'.` }, { status: 400 });
  }

  // Validate replacement staff exists and belongs to org
  const replacement = await db.staff.findUnique({
    where: { id: replacementStaffId },
    include: { user: { select: { organizationId: true } } },
  });
  if (!replacement || replacement.user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid replacement staff" }, { status: 400 });
  }
  if (replacement.employmentStatus !== "active") {
    return NextResponse.json({ error: `Staff is not active (status: ${replacement.employmentStatus}).` }, { status: 400 });
  }

  // Check for shift conflicts on the same day
  const existingShifts = await db.staffShift.findMany({
    where: {
      staffId: replacementStaffId,
      status: { in: ["scheduled", "checked_in", "on_break"] },
      shiftDate: {
        gte: new Date(coverage.shiftDate.getTime() - 24 * 60 * 60 * 1000),
        lte: new Date(coverage.shiftDate.getTime() + 24 * 60 * 60 * 1000),
      },
    },
    select: { id: true, startTime: true, endTime: true },
  });

  const conflicts = detectShiftOverlap(
    { startTime: coverage.startTime, endTime: coverage.endTime },
    existingShifts
  );
  const hasErrors = conflicts.some((c) => c.severity === "error");
  if (hasErrors && !overrideConflicts) {
    return NextResponse.json({
      error: "Replacement staff has conflicting shifts.",
      conflicts,
    }, { status: 409 });
  }

  // Transaction: update coverage + create new shift for replacement
  const result = await db.$transaction(async (tx) => {
    // Update coverage request
    const updated = await tx.coverageRequest.update({
      where: { id },
      data: {
        replacementStaffId,
        status: "assigned",
        assignedAt: new Date(),
        assignedById: session.user.id,
      },
    });

    // If original shift exists, reassign it; otherwise create a new one
    if (coverage.shiftId) {
      await tx.staffShift.update({
        where: { id: coverage.shiftId },
        data: { staffId: replacementStaffId, notes: `Coverage assignment: original staff ${coverage.originalStaffId}. Reason: ${coverage.reason || "N/A"}` },
      });
    } else {
      // Create new shift
      await tx.staffShift.create({
        data: {
          staffId: replacementStaffId,
          facilityId: coverage.facilityId,
          departmentId: coverage.departmentId,
          shiftDate: coverage.shiftDate,
          startTime: coverage.startTime,
          endTime: coverage.endTime,
          shiftType: "on_call",
          status: "scheduled",
          notes: `Coverage assignment for ${coverage.originalStaffId}`,
        },
      });
    }

    // Mark coverage as fulfilled
    await tx.coverageRequest.update({
      where: { id },
      data: { status: "fulfilled" },
    });

    return updated;
  });

  // Notify replacement staff
  try {
    await db.notification.create({
      data: {
        userId: replacement.userId,
        facilityId: coverage.facilityId,
        type: "coverage_assigned",
        title: "Coverage Assignment",
        message: `You have been assigned to cover a shift on ${coverage.shiftDate.toLocaleDateString()}.`,
        referenceType: "coverage_request",
        referenceId: id,
      },
    });
  } catch (e) {
    console.error("Notification failed (non-fatal):", e);
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: coverage.facilityId,
    action: "COVERAGE_ASSIGNED",
    resourceType: "coverage_request",
    resourceId: id,
    newValues: { replacementStaffId, status: "fulfilled" },
  });

  return NextResponse.json({ item: result, conflicts });
}
