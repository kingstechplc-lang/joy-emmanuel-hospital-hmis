// =====================================================================
// API: /api/workforce-dashboard
//   GET — aggregated statistics for the workforce dashboard
//   Returns real DB counts (no hard-coded stats).
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
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const departmentId = url.searchParams.get("departmentId");

  // Scope facilities to user's org
  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  // Today's date range
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const shiftWhere: any = {
    facilityId: facilityId ? facilityId : { in: orgFacilityIds },
    shiftDate: { gte: today, lt: tomorrow },
  };
  if (departmentId) shiftWhere.departmentId = departmentId;

  // ---- SHIFT STATISTICS ----
  const [
    totalShiftsToday,
    scheduledStaff,
    staffOnDuty,
    staffOffDuty,
    nightShiftStaff,
    onCallStaff,
    unfilledShifts,
    shiftConflicts,
    pendingSwaps,
    coverageRequests,
    overtimeMinutes,
  ] = await Promise.all([
    // Total shifts today
    db.staffShift.count({ where: shiftWhere }),
    // Scheduled staff (scheduled status)
    db.staffShift.count({ where: { ...shiftWhere, status: "scheduled" } }),
    // Staff currently on duty (checked_in or on_break)
    db.staffShift.count({ where: { ...shiftWhere, status: { in: ["checked_in", "on_break"] } } }),
    // Staff off duty (checked_out)
    db.staffShift.count({ where: { ...shiftWhere, status: "checked_out" } }),
    // Night shift staff — starts between 19:00-23:59 or 00:00-07:00
    db.staffShift.count({
      where: {
        ...shiftWhere,
        OR: [
          { startTime: { gte: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 19, 0, 0), lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 0, 0, 0) } },
          { startTime: { gte: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0), lt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 7, 0, 0) } },
        ],
      },
    }),
    // On-call staff
    db.staffShift.count({ where: { ...shiftWhere, isOnCall: true } }),
    // Unfilled shifts (no staffing requirement matched, or coverage requests open)
    db.coverageRequest.count({
      where: {
        facilityId: facilityId ? facilityId : { in: orgFacilityIds },
        status: "open",
        shiftDate: { gte: today, lt: tomorrow },
      },
    }),
    // Shift conflicts (count of swap requests with conflict warnings)
    db.shiftSwap.count({
      where: {
        organizationId: session.user.organizationId,
        conflictWarnings: { not: null },
        status: { in: ["requested", "accepted"] },
      },
    }),
    // Pending shift swaps
    db.shiftSwap.count({
      where: {
        organizationId: session.user.organizationId,
        status: { in: ["requested", "accepted"] },
      },
    }),
    // Coverage requests
    db.coverageRequest.count({
      where: {
        facilityId: facilityId ? facilityId : { in: orgFacilityIds },
        status: { in: ["open", "assigned"] },
      },
    }),
    // Overtime minutes (sum across today's shifts)
    db.staffShift.aggregate({
      where: shiftWhere,
      _sum: { overtimeMinutes: true },
    }),
  ]);

  // ---- LEAVE STATISTICS ----
  const orgUsers = await db.user.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const userIds = orgUsers.map((u) => u.id);
  const orgStaff = await db.staff.findMany({
    where: { userId: { in: userIds }, ...(facilityId ? { facilityId } : {}) },
    select: { id: true, departmentId: true },
  });
  const staffIds = orgStaff.map((s) => s.id);
  const filteredStaffIds = departmentId
    ? orgStaff.filter((s) => s.departmentId === departmentId).map((s) => s.id)
    : staffIds;

  const leaveWhere: any = {
    staffId: { in: filteredStaffIds },
  };

  const [
    staffOnLeave,
    pendingLeaveRequests,
    approvedLeave,
    rejectedLeave,
    cancelledLeave,
    staffReturningToday,
    staffGoingOnLeaveSoon,
    overdueReturns,
    leaveConflicts,
  ] = await Promise.all([
    // Staff currently on leave (approved, in date range)
    db.leaveRecord.count({
      where: {
        ...leaveWhere,
        status: "approved",
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
    }),
    // Pending leave requests
    db.leaveRecord.count({ where: { ...leaveWhere, status: "pending" } }),
    // Approved leave (total)
    db.leaveRecord.count({ where: { ...leaveWhere, status: "approved" } }),
    // Rejected leave
    db.leaveRecord.count({ where: { ...leaveWhere, status: "rejected" } }),
    // Cancelled leave
    db.leaveRecord.count({ where: { ...leaveWhere, status: "cancelled" } }),
    // Staff returning today (returnDate == today)
    db.leaveRecord.count({
      where: {
        ...leaveWhere,
        status: "approved",
        returnDate: { gte: today, lt: tomorrow },
      },
    }),
    // Staff going on leave soon (within next 7 days)
    db.leaveRecord.count({
      where: {
        ...leaveWhere,
        status: "approved",
        startDate: { gte: today, lte: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000) },
      },
    }),
    // Overdue returns (returnDate < today but status still approved, no actualReturnDate)
    db.leaveRecord.count({
      where: {
        ...leaveWhere,
        status: "approved",
        returnDate: { lt: today },
        actualReturnDate: null,
      },
    }),
    // Leave conflicts (pending leave that overlaps with shifts)
    db.leaveRecord.count({
      where: {
        ...leaveWhere,
        status: "pending",
      },
    }),
  ]);

  // ---- DEPARTMENTS WITH STAFFING SHORTAGES ----
  // Find departments where current scheduled staff < minimum requirement
  let departmentsWithShortages: any[] = [];
  try {
    const staffingReqs = await db.staffingRequirement.findMany({
      where: {
        organizationId: session.user.organizationId,
        active: true,
        ...(facilityId ? { facilityId } : {}),
      },
      include: {
        facility: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    // Group requirements by facility + department + shiftType
    const reqMap = new Map<string, { facility: any; department: any; shiftType: string; minCount: number }>();
    for (const r of staffingReqs) {
      const key = `${r.facilityId}|${r.departmentId || "none"}|${r.shiftType || "any"}`;
      const existing = reqMap.get(key);
      if (existing) {
        existing.minCount += r.minCount;
      } else {
        reqMap.set(key, {
          facility: r.facility,
          department: r.department,
          shiftType: r.shiftType || "any",
          minCount: r.minCount,
        });
      }
    }

    // Check actual counts for today
    for (const [key, req] of reqMap.entries()) {
      const actualCount = await db.staffShift.count({
        where: {
          facilityId: req.facility.id,
          departmentId: req.department?.id || undefined,
          shiftDate: { gte: today, lt: tomorrow },
          status: { in: ["scheduled", "checked_in", "on_break"] },
        },
      });
      if (actualCount < req.minCount) {
        departmentsWithShortages.push({
          facility: req.facility,
          department: req.department,
          shiftType: req.shiftType,
          required: req.minCount,
          actual: actualCount,
          shortage: req.minCount - actualCount,
        });
      }
    }
  } catch (e) {
    console.error("Failed to compute staffing shortages:", e);
  }

  // ---- TODAY'S STAFFING (per-staff view) ----
  const todaysStaffing = await db.staffShift.findMany({
    where: shiftWhere,
    orderBy: [{ startTime: "asc" }],
    take: 100,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      shiftTypeRef: { select: { id: true, name: true, code: true, colorHex: true } },
    },
  });

  // ---- ON-CALL TODAY ----
  const onCallToday = await db.onCallSchedule.findMany({
    where: {
      facilityId: facilityId ? facilityId : { in: orgFacilityIds },
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
      status: { in: ["scheduled", "active"] },
    },
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, phone: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: [{ isPrimary: "desc" }, { escalationOrder: "asc" }],
    take: 50,
  });

  return NextResponse.json({
    date: today.toISOString(),
    facilityId,
    departmentId,
    shiftStats: {
      totalShiftsToday,
      scheduledStaff,
      staffOnDuty,
      staffOffDuty,
      nightShiftStaff,
      onCallStaff,
      unfilledShifts,
      shiftConflicts,
      pendingSwaps,
      coverageRequests,
      overtimeHours: (overtimeMinutes._sum.overtimeMinutes || 0) / 60,
    },
    leaveStats: {
      staffOnLeave,
      pendingLeaveRequests,
      approvedLeave,
      rejectedLeave,
      cancelledLeave,
      staffReturningToday,
      staffGoingOnLeaveSoon,
      overdueReturns,
      leaveConflicts,
    },
    departmentsWithShortages,
    todaysStaffing,
    onCallToday,
  });
}
