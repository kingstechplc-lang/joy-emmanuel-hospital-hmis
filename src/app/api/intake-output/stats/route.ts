// =====================================================================
// API: /api/intake-output/stats
//   GET — ward/facility I&O dashboard stats
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
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;

  const [
    totalEntries,
    todayEntries,
    todayIntake,
    todayOutput,
    patientsMonitored,
    activeMonitoringPeriods,
    missingEntryPatients,
    activeAlerts,
    criticalAlerts,
    acknowledgedToday,
  ] = await Promise.all([
    db.intakeOutputEntry.count({ where: { ...where, status: { not: "cancelled" } } }),
    db.intakeOutputEntry.count({ where: { ...where, status: { not: "cancelled" }, eventAt: { gte: todayStart, lte: todayEnd } } }),
    db.intakeOutputEntry.aggregate({
      where: { ...where, status: { not: "cancelled" }, entryType: "intake", eventAt: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true },
    }),
    db.intakeOutputEntry.aggregate({
      where: { ...where, status: { not: "cancelled" }, entryType: "output", eventAt: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true },
    }),
    db.intakeOutputEntry.findMany({
      where: { ...where, status: { not: "cancelled" }, eventAt: { gte: todayStart, lte: todayEnd } },
      distinct: ["patientId"],
      select: { patientId: true },
    }),
    db.intakeOutputMonitoringPeriod.count({ where: { ...where, status: "active" } }),
    // patients with active monitoring period but no entry in last interval
    db.intakeOutputMonitoringPeriod.findMany({
      where: { ...where, status: "active" },
      include: {
        entries: {
          where: { eventAt: { gte: new Date(Date.now() - 4 * 60 * 60 * 1000) } },
          select: { id: true },
          take: 1,
        },
      },
    }),
    db.intakeOutputAlert.count({ where: { ...where, status: "active" } }),
    db.intakeOutputAlert.count({ where: { ...where, status: "active", severity: "critical" } }),
    db.intakeOutputAlert.count({ where: { ...where, status: "acknowledged", acknowledgedAt: { gte: todayStart, lte: todayEnd } } }),
  ]);

  const missingCount = missingEntryPatients.filter((p) => p.entries.length === 0).length;

  return NextResponse.json({
    totalEntries,
    todayEntries,
    todayIntakeMl: todayIntake._sum.amount || 0,
    todayOutputMl: todayOutput._sum.amount || 0,
    todayNetMl: (todayIntake._sum.amount || 0) - (todayOutput._sum.amount || 0),
    patientsMonitoredToday: patientsMonitored.length,
    activeMonitoringPeriods,
    missingEntryPatients: missingCount,
    activeAlerts,
    criticalAlerts,
    acknowledgedToday,
  });
}
