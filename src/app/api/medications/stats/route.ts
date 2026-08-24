// =====================================================================
// API: /api/medications/stats
//   GET — medication catalog KPIs
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
  if (!hasPermission(session, PERMISSIONS.PHARMACY_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");

  const orgWhere = { organizationId: session.user.organizationId };

  const [totalActive, totalInactive, totalHighAlert, totalControlled, byCategoryRaw, byFormRaw] = await Promise.all([
    db.medication.count({ where: { ...orgWhere, status: "active" } }),
    db.medication.count({ where: { ...orgWhere, status: "inactive" } }),
    db.medication.count({ where: { ...orgWhere, isHighAlert: true, status: "active" } }),
    db.medication.count({ where: { ...orgWhere, controlledStatus: { notIn: ["none", ""] }, status: "active" } }),
    db.medication.groupBy({ by: ["medicationCategory"], where: { ...orgWhere, status: "active", medicationCategory: { not: null } }, _count: true, orderBy: { _count: { medicationCategory: "desc" } }, take: 10 }),
    db.medication.groupBy({ by: ["dosageForm"], where: { ...orgWhere, status: "active", dosageForm: { not: null } }, _count: true, orderBy: { _count: { dosageForm: "desc" } }, take: 10 }),
  ]);

  // Stock alerts (if facility provided)
  let lowStockCount = 0;
  let expiredBatchCount = 0;
  let nearExpiryCount = 0;
  if (facilityId) {
    const facilityInventory = await db.facilityInventory.findMany({
      where: { facilityId, inventoryItem: { itemType: "medication" } },
      include: {
        inventoryItem: { select: { name: true, medicationId: true } },
        batches: { select: { quantity: true, expiryDate: true, status: true } },
      },
    });
    const now = new Date();
    const nearExpiryThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    for (const fi of facilityInventory) {
      if (fi.minimumQuantity && fi.currentQuantity <= fi.minimumQuantity) lowStockCount++;
      for (const b of fi.batches) {
        if (b.expiryDate && new Date(b.expiryDate) < now && b.quantity > 0) expiredBatchCount++;
        if (b.expiryDate && new Date(b.expiryDate) >= now && new Date(b.expiryDate) <= nearExpiryThreshold && b.quantity > 0) nearExpiryCount++;
      }
    }
  }

  // Top prescribed medications (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const topPrescribed = await db.prescriptionItem.groupBy({
    by: ["medicationId"],
    where: {
      medication: { organizationId: session.user.organizationId },
      createdAt: { gte: thirtyDaysAgo },
    },
    _count: true,
    orderBy: { _count: { medicationId: "desc" } },
    take: 10,
  });

  // Load medication names for the top prescribed
  const topMedIds = topPrescribed.map((t) => t.medicationId);
  const topMeds = await db.medication.findMany({
    where: { id: { in: topMedIds } },
    select: { id: true, genericName: true, brandName: true, strength: true },
  });
  const topMedMap = new Map(topMeds.map((m) => [m.id, m]));
  const topPrescribedNamed = topPrescribed.map((t) => ({
    ...topMedMap.get(t.medicationId),
    count: t._count,
  }));

  return NextResponse.json({
    kpis: {
      totalActive,
      totalInactive,
      totalHighAlert,
      totalControlled,
      lowStockCount,
      expiredBatchCount,
      nearExpiryCount,
    },
    byCategory: byCategoryRaw.map((g) => ({ name: g.medicationCategory, count: g._count })),
    byForm: byFormRaw.map((g) => ({ name: g.dosageForm, count: g._count })),
    topPrescribed: topPrescribedNamed,
  });
}
