// =====================================================================
// API: /api/shift-swaps
//   GET  — list swap requests (filter by staff, status)
//   POST — create a new swap request
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { detectShiftOverlap, detectInsufficientRest, type ConflictWarning } from "@/lib/shift-engine";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const staffId = url.searchParams.get("staffId");
  const status = url.searchParams.get("status");

  const where: any = { organizationId: session.user.organizationId };
  if (status) where.status = status;
  if (staffId) {
    where.OR = [{ requesterStaffId: staffId }, { targetStaffId: staffId }];
  }

  const items = await db.shiftSwap.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      requesterStaff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
      targetStaff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
      requesterShift: { include: { staff: { select: { id: true, firstName: true, lastName: true } }, facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } } },
      targetShift: { include: { staff: { select: { id: true, firstName: true, lastName: true } }, facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } } },
      supervisorApprovedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_SWAP_REQUEST) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { requesterStaffId, targetStaffId, requesterShiftId, targetShiftId, reason } = body;

  if (!requesterStaffId || !requesterShiftId) {
    return NextResponse.json({ error: "requesterStaffId, requesterShiftId are required" }, { status: 400 });
  }

  // Validate requester shift exists and belongs to org
  const requesterShift = await db.staffShift.findUnique({
    where: { id: requesterShiftId },
    include: { staff: { select: { id: true, firstName: true, lastName: true, user: { select: { organizationId: true } } } } },
  });
  if (!requesterShift || requesterShift.staff.user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid requester shift" }, { status: 400 });
  }

  if (requesterShift.staffId !== requesterStaffId) {
    return NextResponse.json({ error: "Shift does not belong to the requester" }, { status: 400 });
  }

  // Run conflict validation against target staff's existing shifts
  let conflictWarnings: ConflictWarning[] = [];
  if (targetStaffId && targetShiftId) {
    const targetShift = await db.staffShift.findUnique({
      where: { id: targetShiftId },
      include: { staff: { select: { id: true, user: { select: { organizationId: true } } } } },
    });
    if (!targetShift || targetShift.staff.user.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid target shift" }, { status: 400 });
    }

    // Check target staff's existing shifts (excluding the target shift itself)
    const targetExistingShifts = await db.staffShift.findMany({
      where: {
        staffId: targetStaffId,
        id: { not: targetShiftId },
        status: { in: ["scheduled", "checked_in", "on_break"] },
        shiftDate: {
          gte: new Date(requesterShift.shiftDate.getTime() - 24 * 60 * 60 * 1000),
          lte: new Date(requesterShift.shiftDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      select: { id: true, startTime: true, endTime: true },
    });

    conflictWarnings = [
      ...detectShiftOverlap(
        { startTime: requesterShift.startTime, endTime: requesterShift.endTime },
        targetExistingShifts
      ),
      ...detectInsufficientRest(
        { startTime: requesterShift.startTime, endTime: requesterShift.endTime },
        targetExistingShifts
      ),
    ];
  }

  const swap = await db.shiftSwap.create({
    data: {
      organizationId: session.user.organizationId,
      requesterStaffId,
      targetStaffId: targetStaffId || null,
      requesterShiftId,
      targetShiftId: targetShiftId || null,
      reason,
      status: "requested",
      requesterApprovedAt: new Date(),
      conflictWarnings: conflictWarnings.length > 0 ? JSON.stringify(conflictWarnings) : null,
    },
  });

  // Notify target staff if specified
  if (targetStaffId) {
    try {
      const targetStaff = await db.staff.findUnique({
        where: { id: targetStaffId },
        select: { userId: true, firstName: true, lastName: true },
      });
      if (targetStaff) {
        await db.notification.create({
          data: {
            userId: targetStaff.userId,
            facilityId: requesterShift.facilityId,
            type: "shift_swap_requested",
            title: "Shift Swap Request",
            message: `${requesterShift.staff.firstName} ${requesterShift.staff.lastName} has requested a shift swap. Please review and accept or decline.`,
            referenceType: "shift_swap",
            referenceId: swap.id,
          },
        });
      }
    } catch (e) {
      console.error("Notification failed (non-fatal):", e);
    }
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SHIFT_SWAP_REQUESTED",
    resourceType: "shift_swap",
    resourceId: swap.id,
    newValues: { requesterStaffId, targetStaffId, requesterShiftId, targetShiftId },
  });

  return NextResponse.json({ item: swap, conflictWarnings }, { status: 201 });
}
