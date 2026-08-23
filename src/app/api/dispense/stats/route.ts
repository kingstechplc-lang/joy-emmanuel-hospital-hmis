// =====================================================================
// API: /api/dispense/stats
//   GET — pharmacy dispensing dashboard KPIs
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
  if (!hasPermission(session, PERMISSIONS.PHARMACY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Prescription stats
  const rxWhere: any = {};
  if (facilityId) rxWhere.facilityId = facilityId;

  const [pending, approved, partiallyDispensed, dispensedToday, cancelledToday] = await Promise.all([
    db.prescription.count({ where: { ...rxWhere, status: "pending" } }),
    db.prescription.count({ where: { ...rxWhere, status: "approved" } }),
    db.prescription.count({ where: { ...rxWhere, status: "partially_dispensed" } }),
    db.prescription.count({ where: { ...rxWhere, status: "dispensed", prescribedAt: { gte: todayStart, lte: todayEnd } } }),
    db.prescription.count({ where: { ...rxWhere, status: "cancelled", prescribedAt: { gte: todayStart, lte: todayEnd } } }),
  ]);

  // Dispensing transactions today
  const txnWhere: any = {
    transactionType: "dispense",
    transactionAt: { gte: todayStart, lte: todayEnd },
  };
  if (facilityId) txnWhere.facilityId = facilityId;

  const dispensedTransactionsToday = await db.inventoryTransaction.count({ where: txnWhere });

  // Low stock items
  let lowStockCount = 0;
  let nearExpiryCount = 0;
  let expiredCount = 0;
  if (facilityId) {
    const lowStock = await db.facilityInventory.findMany({
      where: { facilityId, currentQuantity: { lte: db.facilityInventory.fields.minimumQuantity } },
      select: { id: true },
    });
    lowStockCount = lowStock.length;

    const now = new Date();
    const nearExpiryThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const batches = await db.inventoryBatch.findMany({
      where: {
        facilityInventory: { facilityId },
        quantity: { gt: 0 },
        status: "active",
      },
      select: { expiryDate: true },
    });
    nearExpiryCount = batches.filter((b) => b.expiryDate && new Date(b.expiryDate) > now && new Date(b.expiryDate) <= nearExpiryThreshold).length;
    expiredCount = batches.filter((b) => b.expiryDate && new Date(b.expiryDate) <= now).length;
  }

  return NextResponse.json({
    kpis: {
      pending,
      approved,
      partiallyDispensed,
      dispensedToday,
      cancelledToday,
      dispensedTransactionsToday,
      lowStockCount,
      nearExpiryCount,
      expiredCount,
    },
  });
}
