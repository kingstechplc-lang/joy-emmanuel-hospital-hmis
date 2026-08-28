// API: /api/attendance/corrections/[id]/approve — POST
// Transactional: updates correction + applies to attendance + resolves exceptions + audit
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { calculateWorkedDuration, calculateOvertime, calculateLate, calculateEarlyDeparture } from "@/lib/attendance-engine";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_CORRECTION_APPROVE) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const correction = await db.attendanceCorrection.findUnique({ where: { id }, include: { attendance: true } });
  if (!correction || correction.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (correction.status !== "pending") return NextResponse.json({ error: `Cannot approve a correction in status '${correction.status}'.` }, { status: 400 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  if (correction.attendance?.isLocked) return NextResponse.json({ error: "Cannot approve correction — attendance record is locked." }, { status: 403 });

  // Transaction: update correction + apply to attendance + resolve exceptions
  await db.$transaction(async (tx) => {
    // Update correction
    await tx.attendanceCorrection.update({
      where: { id },
      data: {
        status: "approved",
        reviewedById: session.user.id,
        reviewComment: body.comment || null,
        reviewedAt: new Date(),
      },
    });

    // Apply to attendance
    const att = correction.attendance;
    if (att) {
      const newCheckIn = correction.requestedCheckInAt || att.checkInAt;
      const newCheckOut = correction.requestedCheckOutAt || att.checkOutAt;
      const worked = calculateWorkedDuration(newCheckIn, newCheckOut, att.breakMinutes || 0);
      const lateResult = calculateLate(att.expectedStart, newCheckIn, 10, 0);
      const earlyResult = calculateEarlyDeparture(att.expectedEnd, newCheckOut, 15);
      const overtimeResult = calculateOvertime(worked.netMinutes, att.expectedStart && att.expectedEnd ? Math.round((att.expectedEnd.getTime() - att.expectedStart.getTime()) / (1000 * 60)) : 480, 480, {});

      await tx.staffAttendance.update({
        where: { id: att.id },
        data: {
          checkInAt: newCheckIn,
          checkOutAt: newCheckOut,
          status: correction.requestedStatus || att.status === "correction_pending" ? "checked_out" : att.status,
          lateMinutes: lateResult.lateMinutes,
          earlyDepartureMinutes: earlyResult.earlyMinutes,
          grossMinutes: worked.grossMinutes,
          workedMinutes: worked.netMinutes,
          overtimeMinutes: overtimeResult.overtimeMinutes,
        },
      });

      // Resolve related exceptions
      await tx.attendanceException.updateMany({
        where: { attendanceId: att.id, status: "open" },
        data: { status: "resolved", resolvedById: session.user.id, resolutionNote: `Resolved via correction approval: ${body.comment || "approved"}`, resolvedAt: new Date() },
      });
    }
  });

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_CORRECTION_APPROVED", resourceType: "attendance_correction", resourceId: id, reason: body.comment });
  return NextResponse.json({ item: { id, status: "approved" } });
}
