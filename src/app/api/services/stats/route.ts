// =====================================================================
// API: /api/services/stats
//   GET — services dashboard KPIs
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
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgWhere = { organizationId: session.user.organizationId };

  const [totalActive, totalInactive, totalBillable, totalNhisEligible, totalWithoutPrice, byCategoryRaw, byTypeRaw, totalFacilityPrices] = await Promise.all([
    db.service.count({ where: { ...orgWhere, status: "active" } }),
    db.service.count({ where: { ...orgWhere, status: { in: ["inactive", "archived"] } } }),
    db.service.count({ where: { ...orgWhere, isBillable: true, status: "active" } }),
    db.service.count({ where: { ...orgWhere, nhisEligible: true, status: "active" } }),
    db.service.count({ where: { ...orgWhere, status: "active", isBillable: true, defaultPrice: 0 } }),
    db.service.groupBy({ by: ["category"], where: { ...orgWhere, status: "active", category: { not: null } }, _count: true, orderBy: { _count: { category: "desc" } }, take: 15 }),
    db.service.groupBy({ by: ["serviceType"], where: { ...orgWhere, status: "active", serviceType: { not: null } }, _count: true, orderBy: { _count: { serviceType: "desc" } }, take: 10 }),
    db.facilityServicePrice.count({ where: { service: { organizationId: session.user.organizationId }, status: "active" } }),
  ]);

  // Top billed services (last 30 days by invoice item count)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const topBilled = await db.invoiceItem.groupBy({
    by: ["serviceId"],
    where: {
      service: { organizationId: session.user.organizationId },
      createdAt: { gte: thirtyDaysAgo },
      serviceId: { not: null },
    },
    _count: true,
    _sum: { total: true },
    orderBy: { _count: { serviceId: "desc" } },
    take: 10,
  });

  const topServiceIds = topBilled.map((t) => t.serviceId).filter(Boolean) as string[];
  const topServices = await db.service.findMany({
    where: { id: { in: topServiceIds } },
    select: { id: true, name: true, code: true, defaultPrice: true },
  });
  const topMap = new Map(topServices.map((s) => [s.id, s]));
  const topBilledNamed = topBilled.map((t) => ({
    ...topMap.get(t.serviceId!),
    count: t._count,
    revenue: t._sum.total || 0,
  }));

  return NextResponse.json({
    kpis: {
      totalActive,
      totalInactive,
      totalBillable,
      totalNhisEligible,
      totalWithoutPrice,
      totalFacilityPrices,
    },
    byCategory: byCategoryRaw.map((g) => ({ name: g.category, count: g._count })),
    byType: byTypeRaw.map((g) => ({ name: g.serviceType, count: g._count })),
    topBilled: topBilledNamed,
  });
}
