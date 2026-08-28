// =====================================================================
// API: /api/attendance/dashboard
//   GET — aggregated real-time attendance statistics
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const departmentId = url.searchParams.get("departmentId");

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const attWhere: any = {
    facilityId: facilityId ? facilityId : { in: orgFacilityIds },
    date: { gte: today, lt: tomorrow },
  };
  if (departmentId) attWhere.departmentId = departmentId;

  // Today's attendance stats
  const [
    totalScheduled,
    present,
    checkedIn,
    checkedOut,
    late,
    absent,
    onLeave,
    offDuty,
    onCall,
    earlyDepartures,
    overtimeCount,
    missingCheckouts,
    pendingCorrections,
  ] = await Promise.all([
    // Total scheduled (from StaffShift)
    db.staffShift.count({
      where: {
        facilityId: facilityId ? facilityId : { in: orgFacilityIds },
        shiftDate: { gte: today, lt: tomorrow },
        status: { in: ["scheduled", "checked_in", "on_break", "late"] },
        ...(departmentId ? { departmentId } : {}),
      },
    }),
    // Present (checked in or checked out)
    db.staffAttendance.count({ where: { ...attWhere, status: { in: ["checked_in", "checked_out", "present", "late"] } } }),
    // Checked in (not yet out)
    db.staffAttendance.count({ where: { ...attWhere, status: { in: ["checked_in", "late"] } } }),
    // Checked out
    db.staffAttendance.count({ where: { ...attWhere, status: { in: ["checked_out", "overtime", "early_departure"] } } }),
    // Late
    db.staffAttendance.count({ where: { ...attWhere, lateMinutes: { gt: 0 } } }),
    // Absent
    db.staffAttendance.count({ where: { ...attWhere, status: "absent" } }),
    // On leave (from LeaveRecord)
    db.leaveRecord.count({
      where: {
        staff: { ...(facilityId ? { facilityId } : {}) },
        status: "approved",
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
    }),
    // Off duty (staff with no shift today)
    db.staff.count({
      where: {
        ...(facilityId ? { facilityId } : {}),
        employmentStatus: "active",
        shifts: {
          none: {
            shiftDate: { gte: today, lt: tomorrow },
            status: { in: ["scheduled", "checked_in", "on_break", "late"] },
          },
        },
      },
    }),
    // On call
    db.onCallSchedule.count({
      where: {
        facilityId: facilityId ? facilityId : { in: orgFacilityIds },
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
        status: { in: ["scheduled", "active"] },
      },
    }),
    // Early departures
    db.staffAttendance.count({ where: { ...attWhere, earlyDepartureMinutes: { gt: 0 } } }),
    // Overtime count
    db.staffAttendance.count({ where: { ...attWhere, overtimeMinutes: { gt: 0 } } }),
    // Missing check-outs (checked in but not out, and shift end passed)
    db.staffAttendance.count({
      where: {
        ...attWhere,
        checkInAt: { not: null },
        checkOutAt: null,
        expectedEnd: { lt: new Date() },
      },
    }),
    // Pending corrections
    db.attendanceCorrection.count({
      where: { organizationId: session.user.organizationId, status: "pending" },
    }),
  ]);

  // Total overtime minutes today
  const overtimeAgg = await db.staffAttendance.aggregate({
    where: attWhere,
    _sum: { overtimeMinutes: true },
  });

  // Total worked minutes today
  const workedAgg = await db.staffAttendance.aggregate({
    where: attWhere,
    _sum: { workedMinutes: true },
  });

  // Open exceptions
  const openExceptions = await db.attendanceException.count({
    where: {
      facilityId: facilityId ? facilityId : { in: orgFacilityIds },
      date: { gte: today, lt: tomorrow },
      status: "open",
    },
  });

  // Today's attendance records (for live board)
  const todaysAttendance = await db.staffAttendance.findMany({
    where: attWhere,
    orderBy: [{ checkInAt: "asc" }],
    take: 100,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      shift: { select: { id: true, startTime: true, endTime: true, shiftType: true } },
    },
  });

  // Department breakdown
  const departmentStats = await db.staffAttendance.groupBy({
    by: ["departmentId"],
    where: attWhere,
    _count: { id: true },
    _sum: { workedMinutes: true, overtimeMinutes: true, lateMinutes: true },
  });

  return NextResponse.json({
    date: today.toISOString(),
    facilityId,
    departmentId,
    stats: {
      totalScheduled,
      present,
      checkedIn,
      checkedOut,
      late,
      absent,
      onLeave,
      offDuty,
      onCall,
      earlyDepartures,
      overtimeCount,
      overtimeMinutes: overtimeAgg._sum.overtimeMinutes || 0,
      workedMinutes: workedAgg._sum.workedMinutes || 0,
      missingCheckouts,
      pendingCorrections,
      openExceptions,
    },
    todaysAttendance,
    departmentStats,
  });
}
