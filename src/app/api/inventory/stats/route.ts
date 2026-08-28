// =====================================================================
// API: /api/inventory/stats
//   GET — inventory dashboard statistics:
//     • Total / active / inactive items
//     • Total stock quantity + total stock value (currentQty * lastCostPrice)
//     • Low stock / out of stock counts
//     • Expiring soon (≤30d) / expired batches
//     • Pending purchase orders / pending stock transfers
//     • Quarantined stock count
//     • Pending stock adjustments
//     • Breakdown by item type and category
//     • Top 10 items by stock value
//
//   All queries are wrapped in resilient safeCount / safeAggregate helpers
//   so a single failure won't break the dashboard. Filters by facilityId
//   (query param or session facility).
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
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;

  // -----------------------------------------------------------------
  // Item-level where (organization-scoped)
  // -----------------------------------------------------------------
  const itemWhere: any = { organizationId: session.user.organizationId };
  const fiWhere: any = {};
  if (facilityId) fiWhere.facilityId = facilityId;

  // -----------------------------------------------------------------
  // Resilient helpers — never throw, always return safe defaults
  // -----------------------------------------------------------------
  const safeCount = async (model: any, w: any): Promise<number> => {
    try {
      return await (db as any)[model].count({ where: w });
    } catch {
      return 0;
    }
  };

  const safeAggregate = async (
    model: any,
    w: any,
    sumField: string
  ): Promise<{ count: number; total: number }> => {
    try {
      const res = await (db as any)[model].aggregate({
        where: w,
        _count: true,
        _sum: { [sumField]: true },
      });
      return {
        count: (res._count as any) ?? 0,
        total: (res._sum as any)?.[sumField] ?? 0,
      };
    } catch {
      return { count: 0, total: 0 };
    }
  };

  const safeGroupBy = async (
    model: any,
    field: string,
    w: any
  ): Promise<{ label: string; count: number }[]> => {
    try {
      const rows = await (db as any)[model].groupBy({ by: [field], where: w, _count: true });
      return rows.map((r: any) => ({
        label: r[field] || "unknown",
        count: r._count ?? 0,
      }));
    } catch {
      return [];
    }
  };

  // -----------------------------------------------------------------
  // Time windows
  // -----------------------------------------------------------------
  const now = new Date();
  const expiringSoonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

  // -----------------------------------------------------------------
  // Item counts
  // -----------------------------------------------------------------
  const [totalItems, activeItems, inactiveItems] = await Promise.all([
    safeCount("inventoryItem", { ...itemWhere }),
    safeCount("inventoryItem", { ...itemWhere, status: "active" }),
    safeCount("inventoryItem", { ...itemWhere, status: { not: "active" } }),
  ]);

  // -----------------------------------------------------------------
  // Facility inventory aggregates — total qty, reservations, quarantine, damaged
  // -----------------------------------------------------------------
  const [totalQtyAgg, reservedAgg, quarantinedAgg, damagedAgg] = await Promise.all([
    safeAggregate("facilityInventory", fiWhere, "currentQuantity"),
    safeAggregate("facilityInventory", fiWhere, "reservedQuantity"),
    safeAggregate("facilityInventory", fiWhere, "quarantinedQuantity"),
    safeAggregate("facilityInventory", fiWhere, "damagedQuantity"),
  ]);

  // -----------------------------------------------------------------
  // Stock value = sum(currentQuantity * lastCostPrice). Prisma can't multiply
  // across columns in aggregate, so we fetch the rows and sum client-side.
  // Also derive low-stock and out-of-stock counts in the same pass.
  // -----------------------------------------------------------------
  let totalStockValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  try {
    const fiRows = await db.facilityInventory.findMany({
      where: fiWhere,
      select: {
        currentQuantity: true,
        lastCostPrice: true,
        minimumQuantity: true,
      },
    });
    for (const r of fiRows) {
      totalStockValue += Number(r.currentQuantity) * Number(r.lastCostPrice || 0);
      if (Number(r.currentQuantity) === 0) outOfStockCount += 1;
      else if (Number(r.minimumQuantity) > 0 && Number(r.currentQuantity) <= Number(r.minimumQuantity)) {
        lowStockCount += 1;
      }
    }
  } catch {
    // leave at 0
  }

  // -----------------------------------------------------------------
  // Batches — expiring soon / expired
  // -----------------------------------------------------------------
  let expiringSoonCount = 0;
  let expiredCount = 0;
  try {
    const batchFacilityFilter = facilityId ? { facilityInventory: { facilityId } } : {};
    const batches = await db.inventoryBatch.findMany({
      where: {
        ...batchFacilityFilter,
        quantity: { gt: 0 },
        expiryDate: { not: null },
      },
      select: { expiryDate: true, status: true },
    });
    for (const b of batches) {
      if (!b.expiryDate) continue;
      const exp = new Date(b.expiryDate);
      if (exp < now) {
        if (b.status === "active") expiredCount += 1;
      } else if (exp <= expiringSoonThreshold) {
        expiringSoonCount += 1;
      }
    }
  } catch {
    // leave at 0
  }

  // -----------------------------------------------------------------
  // Pending purchase orders + stock transfers
  // -----------------------------------------------------------------
  const poWhere: any = {};
  if (facilityId) poWhere.facilityId = facilityId;
  const pendingPurchaseOrders = await safeCount("purchaseOrder", {
    ...poWhere,
    status: { in: ["draft", "submitted", "approved", "ordered", "partially_received"] },
  });

  const stWhere: any = facilityId
    ? { OR: [{ fromFacilityId: facilityId }, { toFacilityId: facilityId }] }
    : {};
  const pendingStockTransfers = await safeCount("stockTransfer", {
    ...stWhere,
    status: { in: ["requested", "approved", "shipped"] },
  });

  // -----------------------------------------------------------------
  // Pending stock adjustments
  // -----------------------------------------------------------------
  const adjWhere: any = {};
  if (facilityId) adjWhere.facilityId = facilityId;
  const pendingAdjustments = await safeCount("stockAdjustment", {
    ...adjWhere,
    status: "pending",
  });

  // -----------------------------------------------------------------
  // Quarantined stock count (distinct facility inventory rows with >0 quarantined)
  // -----------------------------------------------------------------
  let quarantinedStockCount = 0;
  try {
    quarantinedStockCount = await db.facilityInventory.count({
      where: { ...fiWhere, quarantinedQuantity: { gt: 0 } },
    });
  } catch {
    quarantinedStockCount = 0;
  }

  // -----------------------------------------------------------------
  // Breakdowns by type / category
  // -----------------------------------------------------------------
  const byItemType = await safeGroupBy("inventoryItem", "itemType", itemWhere);
  const byCategory = await safeGroupBy("inventoryItem", "category", {
    ...itemWhere,
    category: { not: null },
  });

  // -----------------------------------------------------------------
  // Top 10 items by stock value
  // -----------------------------------------------------------------
  let topItemsByValue: {
    id: string;
    name: string;
    sku: string;
    itemType: string;
    currentQuantity: number;
    lastCostPrice: number;
    stockValue: number;
  }[] = [];
  try {
    const fiRows = await db.facilityInventory.findMany({
      where: fiWhere,
      take: 500,
      orderBy: { currentQuantity: "desc" },
      include: {
        inventoryItem: {
          select: { id: true, name: true, sku: true, itemType: true },
        },
      },
    });
    topItemsByValue = fiRows
      .map((r: any) => ({
        id: r.inventoryItem?.id || r.id,
        name: r.inventoryItem?.name || "—",
        sku: r.inventoryItem?.sku || "",
        itemType: r.inventoryItem?.itemType || "other",
        currentQuantity: Number(r.currentQuantity) || 0,
        lastCostPrice: Number(r.lastCostPrice) || 0,
        stockValue: Number(r.currentQuantity) * Number(r.lastCostPrice || 0),
      }))
      .filter((r: any) => r.stockValue > 0)
      .sort((a: any, b: any) => b.stockValue - a.stockValue)
      .slice(0, 10);
  } catch {
    topItemsByValue = [];
  }

  return NextResponse.json({
    kpis: {
      totalItems,
      activeItems,
      inactiveItems,
      totalStockQuantity: totalQtyAgg.total,
      totalStockValue,
      lowStockCount,
      outOfStockCount,
      expiringSoonCount,
      expiredCount,
      pendingPurchaseOrders,
      pendingStockTransfers,
      quarantinedStockCount,
      pendingAdjustments,
      reservedQuantity: reservedAgg.total,
      damagedQuantity: damagedAgg.total,
      quarantinedQuantity: quarantinedAgg.total,
    },
    breakdowns: {
      byItemType,
      byCategory: byCategory.sort((a, b) => b.count - a.count),
    },
    topItemsByValue,
    facilityId,
  });
}
