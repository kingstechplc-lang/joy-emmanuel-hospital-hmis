// =====================================================================
// API: /api/appointments/stats
//   GET — appointment dashboard KPIs (today, upcoming, performance)
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
  if (!hasPermission(session, PERMISSIONS.APPOINTMENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = {};
  if (facilityId && orgFacilityIds.includes(facilityId)) {
    where.facilityId = facilityId;
  } else {
    where.facilityId = { in: orgFacilityIds };
  }

  // Today's date range
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Tomorrow
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  // This week (next 7 days)
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const todayWhere = { ...where, scheduledStart: { gte: todayStart, lte: todayEnd } };
  const tomorrowWhere = { ...where, scheduledStart: { gte: tomorrowStart, lte: tomorrowEnd } };
  const weekWhere = { ...where, scheduledStart: { gte: todayStart, lte: weekEnd } };

  const [todayTotal, todayConfirmed, todayCheckedIn, todayCompleted, todayCancelled, todayNoShow, todayScheduled, tomorrowCount, weekCount, totalAllTime, completedAllTime, cancelledAllTime, noShowAllTime] = await Promise.all([
    db.appointment.count({ where: todayWhere }),
    db.appointment.count({ where: { ...todayWhere, status: "confirmed" } }),
    db.appointment.count({ where: { ...todayWhere, status: "checked_in" } }),
    db.appointment.count({ where: { ...todayWhere, status: "completed" } }),
    db.appointment.count({ where: { ...todayWhere, status: "cancelled" } }),
    db.appointment.count({ where: { ...todayWhere, status: "no_show" } }),
    db.appointment.count({ where: { ...todayWhere, status: "scheduled" } }),
    db.appointment.count({ where: tomorrowWhere }),
    db.appointment.count({ where: weekWhere }),
    db.appointment.count({ where }),
    db.appointment.count({ where: { ...where, status: "completed" } }),
    db.appointment.count({ where: { ...where, status: "cancelled" } }),
    db.appointment.count({ where: { ...where, status: "no_show" } }),
  ]);

  // Calculate rates
  const completionRate = totalAllTime > 0 ? Math.round((completedAllTime / totalAllTime) * 100) : 0;
  const cancellationRate = totalAllTime > 0 ? Math.round((cancelledAllTime / totalAllTime) * 100) : 0;
  const noShowRate = totalAllTime > 0 ? Math.round((noShowAllTime / totalAllTime) * 100) : 0;

  // Waiting list count
  const waitingListCount = await db.waitingList.count({
    where: { organizationId: session.user.organizationId, status: "waiting" },
  });

  return NextResponse.json({
    today: {
      total: todayTotal,
      scheduled: todayScheduled,
      confirmed: todayConfirmed,
      checkedIn: todayCheckedIn,
      completed: todayCompleted,
      cancelled: todayCancelled,
      noShow: todayNoShow,
    },
    upcoming: {
      tomorrow: tomorrowCount,
      thisWeek: weekCount,
    },
    performance: {
      total: totalAllTime,
      completed: completedAllTime,
      cancelled: cancelledAllTime,
      noShow: noShowAllTime,
      completionRate,
      cancellationRate,
      noShowRate,
    },
    waitingList: waitingListCount,
  });
}
