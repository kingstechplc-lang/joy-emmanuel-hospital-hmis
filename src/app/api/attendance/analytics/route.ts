// =====================================================================
// API: /api/attendance/analytics
//   GET — attendance analytics (trends, department comparison, rates)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { calculateAttendanceRate } from "@/lib/attendance-engine";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_REPORT_VIEW) && !hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  // Default to last 30 days
  const end = dateTo ? new Date(dateTo) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = dateFrom ? new Date(dateFrom) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true, name: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = {
    facilityId: facilityId ? facilityId : { in: orgFacilityIds },
    date: { gte: start, lte: end },
  };

  // Aggregate stats
  const [
    totalRecords,
    lateCount,
    earlyDepartureCount,
    absentCount,
    missingCheckoutCount,
    overtimeCount,
    onLeaveCount,
    totalWorkedAgg,
    totalOvertimeAgg,
    totalLateAgg,
  ] = await Promise.all([
    db.staffAttendance.count({ where }),
    db.staffAttendance.count({ where: { ...where, lateMinutes: { gt: 0 } } }),
    db.staffAttendance.count({ where: { ...where, earlyDepartureMinutes: { gt: 0 } } }),
    db.staffAttendance.count({ where: { ...where, status: "absent" } }),
    db.staffAttendance.count({ where: { ...where, checkInAt: { not: null }, checkOutAt: null } }),
    db.staffAttendance.count({ where: { ...where, overtimeMinutes: { gt: 0 } } }),
    db.leaveRecord.count({
      where: {
        staff: { ...(facilityId ? { facilityId } : {}) },
        status: "approved",
        startDate: { lte: end },
        OR: [{ endDate: null }, { endDate: { gte: start } }],
      },
    }),
    db.staffAttendance.aggregate({ where, _sum: { workedMinutes: true } }),
    db.staffAttendance.aggregate({ where, _sum: { overtimeMinutes: true } }),
    db.staffAttendance.aggregate({ where, _sum: { lateMinutes: true } }),
  ]);

  // Daily trend (last 14 days)
  const trendDays: any[] = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const dayRecords = await db.staffAttendance.count({
      where: {
        ...where,
        date: { gte: dayStart, lte: dayEnd },
        status: { in: ["checked_in", "checked_out", "present", "late", "overtime", "early_departure"] },
      },
    });
    const dayLate = await db.staffAttendance.count({
      where: { ...where, date: { gte: dayStart, lte: dayEnd }, lateMinutes: { gt: 0 } },
    });
    const dayAbsent = await db.staffAttendance.count({
      where: { ...where, date: { gte: dayStart, lte: dayEnd }, status: "absent" },
    });
    trendDays.push({
      date: dayStart.toISOString().slice(0, 10),
      present: dayRecords,
      late: dayLate,
      absent: dayAbsent,
    });
  }

  // Department comparison
  const deptStats = await db.staffAttendance.groupBy({
    by: ["departmentId"],
    where,
    _count: { id: true },
    _sum: { workedMinutes: true, overtimeMinutes: true, lateMinutes: true },
  });

  // Enrich department names
  const deptIds = deptStats.map((d) => d.departmentId).filter((id): id is string => !!id);
  const departments = deptIds.length > 0 ? await db.department.findMany({
    where: { id: { in: deptIds } },
    select: { id: true, name: true },
  }) : [];
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  const departmentComparison = deptStats.map((d) => ({
    departmentId: d.departmentId,
    departmentName: d.departmentId ? deptMap.get(d.departmentId) || "Unknown" : "Unassigned",
    totalRecords: d._count.id,
    totalWorkedMinutes: d._sum.workedMinutes || 0,
    totalOvertimeMinutes: d._sum.overtimeMinutes || 0,
    totalLateMinutes: d._sum.lateMinutes || 0,
  }));

  // Facility comparison (if not filtered to single facility)
  let facilityComparison: any[] = [];
  if (!facilityId) {
    const facStats = await db.staffAttendance.groupBy({
      by: ["facilityId"],
      where,
      _count: { id: true },
      _sum: { workedMinutes: true, overtimeMinutes: true },
    });
    const facMap = new Map(orgFacilities.map((f) => [f.id, f.name]));
    facilityComparison = facStats.map((f) => ({
      facilityId: f.facilityId,
      facilityName: facMap.get(f.facilityId) || "Unknown",
      totalRecords: f._count.id,
      totalWorkedMinutes: f._sum.workedMinutes || 0,
      totalOvertimeMinutes: f._sum.overtimeMinutes || 0,
    }));
  }

  // Attendance rate
  const attendanceRate = calculateAttendanceRate(totalRecords, totalRecords - absentCount, onLeaveCount);

  return NextResponse.json({
    dateRange: { start, end },
    facilityId,
    summary: {
      totalRecords,
      lateCount,
      earlyDepartureCount,
      absentCount,
      missingCheckoutCount,
      overtimeCount,
      onLeaveCount,
      totalWorkedMinutes: totalWorkedAgg._sum.workedMinutes || 0,
      totalOvertimeMinutes: totalOvertimeAgg._sum.overtimeMinutes || 0,
      totalLateMinutes: totalLateAgg._sum.lateMinutes || 0,
      attendanceRate: attendanceRate.attendanceRate,
    },
    trend: trendDays,
    departmentComparison,
    facilityComparison,
  });
}
