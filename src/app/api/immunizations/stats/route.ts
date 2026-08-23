// =====================================================================
// API: /api/immunizations/stats
//   GET — immunization dashboard KPIs
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
  if (!hasPermission(session, PERMISSIONS.IMMUNIZATION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId;
  if (!facilityId) {
    return NextResponse.json({
      kpis: {
        total: 0, today: 0, thisWeek: 0, thisMonth: 0,
        dueToday: 0, overdue: 0, aefiOpen: 0, lowStock: 0, expiredStock: 0,
      },
      byVaccine: [],
      byStatus: {},
      trend: [],
    });
  }

  const where = { facilityId };
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [total, todayCount, weekCount, monthCount, aefiOpen, byStatusRaw, byVaccineRaw, recent30] = await Promise.all([
    db.immunization.count({ where }),
    db.immunization.count({
      where: { ...where, administeredAt: { gte: todayStart }, status: "completed" },
    }),
    db.immunization.count({
      where: { ...where, administeredAt: { gte: weekAgo }, status: "completed" },
    }),
    db.immunization.count({
      where: { ...where, administeredAt: { gte: monthAgo }, status: "completed" },
    }),
    db.aEFI.count({ where: { facilityId, status: { in: ["open", "under_review", "follow_up_required"] } } }),
    db.immunization.groupBy({ by: ["status"], where, _count: true }),
    db.immunization.groupBy({ by: ["vaccineName"], where: { ...where, status: "completed" }, _count: true, orderBy: { _count: { vaccineName: "desc" } }, take: 10 }),
    db.immunization.findMany({
      where: { ...where, administeredAt: { gte: monthAgo }, status: "completed" },
      select: { administeredAt: true },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const g of byStatusRaw) byStatus[g.status] = g._count;

  const byVaccine = byVaccineRaw.map((g) => ({ name: g.vaccineName, count: g._count }));

  // Build 30-day trend
  const trend: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const iso = d.toISOString().slice(0, 10);
    trend.push({ date: iso, count: 0 });
  }
  const trendMap = new Map(trend.map((t) => [t.date, t]));
  for (const r of recent30) {
    const iso = new Date(r.administeredAt).toISOString().slice(0, 10);
    const t = trendMap.get(iso);
    if (t) t.count++;
  }

  // Stock alerts — count vaccine-type inventory items that are low or expired
  const vaccineInventoryItems = await db.facilityInventory.findMany({
    where: {
      facilityId,
      inventoryItem: { itemType: "vaccine" },
    },
    include: {
      inventoryItem: { select: { name: true } },
      batches: { select: { quantity: true, expiryDate: true, status: true } },
    },
  });

  let lowStock = 0;
  let expiredStock = 0;
  for (const fi of vaccineInventoryItems) {
    if (fi.minimumQuantity && fi.currentQuantity <= fi.minimumQuantity) lowStock++;
    for (const b of fi.batches) {
      if (b.expiryDate && new Date(b.expiryDate) < now && b.quantity > 0) expiredStock++;
    }
  }

  // Due/overdue — compute from patient schedules is expensive; for the
  // dashboard we use a simpler heuristic: count immunizations with
  // status='due' or 'overdue' at this facility.
  const dueTodayCount = byStatus["due"] || 0;
  const overdueCount = byStatus["overdue"] || 0;

  return NextResponse.json({
    kpis: {
      total,
      today: todayCount,
      thisWeek: weekCount,
      thisMonth: monthCount,
      dueToday: dueTodayCount,
      overdue: overdueCount,
      aefiOpen,
      lowStock,
      expiredStock,
    },
    byStatus,
    byVaccine,
    trend,
  });
}
