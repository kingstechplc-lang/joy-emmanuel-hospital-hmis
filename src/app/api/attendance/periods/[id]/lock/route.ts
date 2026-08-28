// API: /api/attendance/periods/[id]/lock — POST
// Transactional: locks the period + locks all attendance records in the date range
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_PERIOD_LOCK) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const period = await db.attendancePeriod.findUnique({ where: { id } });
  if (!period || period.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (period.status === "locked") return NextResponse.json({ error: "Period is already locked." }, { status: 400 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  const whereAttendance: any = {
    date: { gte: period.startDate, lte: period.endDate },
    facilityId: period.facilityId || undefined,
  };
  const attendanceRecords = await db.staffAttendance.findMany({ where: whereAttendance, select: { id: true, workedMinutes: true, overtimeMinutes: true } });
  const totalRecords = attendanceRecords.length;
  const totalWorkedMinutes = attendanceRecords.reduce((sum, r) => sum + (r.workedMinutes || 0), 0);
  const totalOvertimeMinutes = attendanceRecords.reduce((sum, r) => sum + (r.overtimeMinutes || 0), 0);
  const totalExceptions = await db.attendanceException.count({ where: { date: { gte: period.startDate, lte: period.endDate }, facilityId: period.facilityId || undefined, status: { not: "resolved" } } });
  const totalCorrections = await db.attendanceCorrection.count({ where: { organizationId: session.user.organizationId, status: "pending" } });

  await db.$transaction(async (tx) => {
    await tx.staffAttendance.updateMany({
      where: whereAttendance,
      data: { isLocked: true, periodId: id },
    });
    await tx.attendancePeriod.update({
      where: { id },
      data: {
        status: "locked",
        lockedAt: new Date(),
        lockedById: session.user.id,
        totalRecords,
        totalExceptions,
        totalCorrections,
        totalOvertimeMinutes,
        totalWorkedMinutes,
      },
    });
  });

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_PERIOD_LOCKED", resourceType: "attendance_period", resourceId: id, newValues: { totalRecords, totalWorkedMinutes, totalOvertimeMinutes }, reason: body.reason });
  return NextResponse.json({ item: { id, status: "locked", totalRecords, totalWorkedMinutes, totalOvertimeMinutes } });
}
