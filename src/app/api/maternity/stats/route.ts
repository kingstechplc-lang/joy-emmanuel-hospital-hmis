// =====================================================================
// API: /api/maternity/stats
//   GET — maternity dashboard KPIs
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
  if (!hasPermission(session, PERMISSIONS.MATERNITY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId;
  if (!facilityId) {
    return NextResponse.json({ kpis: {}, byStatus: {}, byRiskLevel: {} });
  }

  const where = { facilityId };
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalActive,
    newThisMonth,
    highRisk,
    deliveriesToday,
    deliveriesThisMonth,
    currentLabor,
    postnatalPatients,
    newbornsThisMonth,
    byStatusRaw,
    byRiskRaw,
  ] = await Promise.all([
    db.maternityRecord.count({ where: { ...where, pregnancyStatus: "active" } }),
    db.maternityRecord.count({ where: { ...where, createdAt: { gte: monthStart } } }),
    db.maternityRecord.count({ where: { ...where, pregnancyStatus: "active", riskLevel: "high" } }),
    db.maternityRecord.count({ where: { ...where, deliveryDate: { gte: todayStart } } }),
    db.maternityRecord.count({ where: { ...where, deliveryDate: { gte: monthStart } } }),
    db.laborAndDelivery.count({ where: { facilityId, deliveryDate: null } }),
    db.postnatalVisit.count({ where: { facilityId, createdAt: { gte: monthStart } } }),
    db.newbornRecord.count({ where: { deliveryRecord: { facilityId }, birthDate: { gte: monthStart } } }),
    db.maternityRecord.groupBy({ by: ["pregnancyStatus"], where, _count: true }),
    db.maternityRecord.groupBy({ by: ["riskLevel"], where: { ...where, pregnancyStatus: "active" }, _count: true }),
  ]);

  // Expected deliveries in next 7 days
  const expectedDeliveries = await db.maternityRecord.count({
    where: {
      ...where,
      pregnancyStatus: "active",
      eddFinal: { gte: now, lte: weekAhead },
    },
  });

  // ANC visits today
  const ancVisitsToday = await db.ancVisit.count({
    where: { facilityId, visitDate: { gte: todayStart } },
  });

  const byStatus: Record<string, number> = {};
  for (const g of byStatusRaw) byStatus[g.pregnancyStatus] = g._count;
  const byRiskLevel: Record<string, number> = {};
  for (const g of byRiskRaw) byRiskLevel[g.riskLevel] = g._count;

  return NextResponse.json({
    kpis: {
      totalActive,
      newThisMonth,
      highRisk,
      expectedDeliveries,
      deliveriesToday,
      deliveriesThisMonth,
      currentLabor,
      postnatalPatients,
      newbornsThisMonth,
      ancVisitsToday,
    },
    byStatus,
    byRiskLevel,
  });
}
