// =====================================================================
// API: /api/shift-swaps/[id]/approve — POST (supervisor approves)
//   Validates conflict warnings, then swaps the staff assignments.
//   Transactional — both shifts updated or none.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { detectShiftOverlap, detectInsufficientRest, type ConflictWarning } from "@/lib/shift-engine";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_SWAP_APPROVE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const swap = await db.shiftSwap.findUnique({
    where: { id },
    include: {
      requesterShift: true,
      targetShift: true,
    },
  });
  if (!swap || swap.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (swap.status !== "accepted" && swap.status !== "requested") {
    return NextResponse.json({ error: `Cannot approve a swap in status '${swap.status}'.` }, { status: 400 });
  }
  if (!swap.targetStaffId || !swap.targetShiftId) {
    return NextResponse.json({ error: "Swap must have a target staff and target shift before approval." }, { status: 400 });
  }

  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  // Re-validate conflicts at approval time
  const targetExistingShifts = await db.staffShift.findMany({
    where: {
      staffId: swap.targetStaffId,
      id: { not: swap.targetShiftId },
      status: { in: ["scheduled", "checked_in", "on_break"] },
      shiftDate: {
        gte: new Date(swap.requesterShift!.shiftDate.getTime() - 24 * 60 * 60 * 1000),
        lte: new Date(swap.requesterShift!.shiftDate.getTime() + 24 * 60 * 60 * 1000),
      },
    },
    select: { id: true, startTime: true, endTime: true },
  });
  const conflictWarnings: ConflictWarning[] = [
    ...detectShiftOverlap(
      { startTime: swap.requesterShift!.startTime, endTime: swap.requesterShift!.endTime },
      targetExistingShifts
    ),
    ...detectInsufficientRest(
      { startTime: swap.requesterShift!.startTime, endTime: swap.requesterShift!.endTime },
      targetExistingShifts
    ),
  ];

  // Hard block on error-severity conflicts unless override is explicitly provided
  const hasErrors = conflictWarnings.some((w) => w.severity === "error");
  if (hasErrors && !body.overrideConflicts) {
    return NextResponse.json({
      error: "Cannot approve swap due to unresolved conflict errors.",
      conflictWarnings,
    }, { status: 409 });
  }

  // Transaction: swap staff assignments
  await db.$transaction(async (tx) => {
    // Save original values for audit
    const requesterShiftOriginal = { staffId: swap.requesterShift!.staffId };
    const targetShiftOriginal = swap.targetShift ? { staffId: swap.targetShift.staffId } : null;

    // Swap: requesterShift now belongs to target staff, targetShift now belongs to requester
    await tx.staffShift.update({
      where: { id: swap.requesterShiftId },
      data: { staffId: swap.targetStaffId! },
    });
    await tx.staffShift.update({
      where: { id: swap.targetShiftId! },
      data: { staffId: swap.requesterStaffId },
    });

    // Update swap record
    await tx.shiftSwap.update({
      where: { id },
      data: {
        status: "approved",
        supervisorApprovedAt: new Date(),
        supervisorApprovedById: session.user.id,
        conflictWarnings: conflictWarnings.length > 0 ? JSON.stringify(conflictWarnings) : null,
      },
    });
  });

  // Notify both staff
  try {
    const staffToNotify = [
      { staffId: swap.requesterStaffId, msg: "Your shift swap has been approved." },
      { staffId: swap.targetStaffId, msg: "A shift swap has been approved. You now have a new shift assignment." },
    ];
    for (const { staffId, msg } of staffToNotify) {
      const staff = await db.staff.findUnique({ where: { id: staffId }, select: { userId: true } });
      if (staff) {
        await db.notification.create({
          data: {
            userId: staff.userId,
            type: "shift_swap_approved",
            title: "Shift Swap Approved",
            message: msg,
            referenceType: "shift_swap",
            referenceId: id,
          },
        });
      }
    }
  } catch (e) {
    console.error("Notification failed (non-fatal):", e);
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SHIFT_SWAP_APPROVED",
    resourceType: "shift_swap",
    resourceId: id,
    newValues: { status: "approved", supervisorApprovedById: session.user.id },
    reason: body.reason,
  });

  return NextResponse.json({ item: { id, status: "approved" }, conflictWarnings });
}
