// =====================================================================
// API: /api/suppliers/stats
//   GET — dashboard stats for the suppliers module.
//   Returns counts by status/category/type/compliance, total spend,
//   pending POs, pending deliveries, expiring & expired documents.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Resilient helpers — return 0 instead of throwing on query failures.
async function safeCount(p: Promise<number>): Promise<number> {
  try {
    const r = await p;
    return Number(r) || 0;
  } catch {
    return 0;
  }
}

async function safeGroupBy(
  p: Promise<{ category?: string | null; supplierType?: string | null; complianceStatus?: string | null; _count: { _all: number } }[]>,
  key: "category" | "supplierType" | "complianceStatus"
): Promise<{ key: string; count: number }[]> {
  try {
    const r = await p;
    return (r || []).map((g) => ({
      key: (g as any)[key] || "unspecified",
      count: g._count?._all ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.organizationId;

  try {
    // ---- Independent counts (run in parallel) ----
    const [
      totalSuppliers,
      activeCount,
      pendingVerificationCount,
      suspendedCount,
      inactiveCount,
      preferredCount,
      pendingPOs,
      pendingDeliveries,
    ] = await Promise.all([
      safeCount(db.supplier.count({ where: { organizationId: orgId } })),
      safeCount(db.supplier.count({ where: { organizationId: orgId, status: "active" } })),
      safeCount(
        db.supplier.count({ where: { organizationId: orgId, status: "pending_verification" } })
      ),
      safeCount(db.supplier.count({ where: { organizationId: orgId, status: "suspended" } })),
      safeCount(db.supplier.count({ where: { organizationId: orgId, status: "inactive" } })),
      safeCount(db.supplier.count({ where: { organizationId: orgId, isPreferred: true } })),
      safeCount(
        db.purchaseOrder.count({
          where: {
            facility: { organizationId: orgId },
            status: { in: ["submitted", "approved"] },
          },
        })
      ),
      safeCount(
        db.purchaseOrder.count({
          where: {
            facility: { organizationId: orgId },
            status: "ordered",
          },
        })
      ),
    ]);

    // ---- Aggregated spend & orders (resilient) ----
    let totalSpendValue = 0;
    let totalOrdersValue = 0;
    try {
      const spendAgg = await db.supplier.aggregate({
        where: { organizationId: orgId },
        _sum: { totalSpend: true },
      });
      totalSpendValue = Number(spendAgg._sum?.totalSpend ?? 0) || 0;
    } catch (err) {
      console.error("[stats] totalSpend aggregate failed:", err);
    }
    try {
      const ordersAgg = await db.supplier.aggregate({
        where: { organizationId: orgId },
        _sum: { totalOrders: true },
      });
      totalOrdersValue = Number(ordersAgg._sum?.totalOrders ?? 0) || 0;
    } catch (err) {
      console.error("[stats] totalOrders aggregate failed:", err);
    }

    // ---- Group by category / supplierType / complianceStatus (resilient) ----
    const [byCategory, byType, byCompliance] = await Promise.all([
      safeGroupBy(
        db.supplier.groupBy({
          by: ["category"],
          where: { organizationId: orgId },
          _count: { _all: true },
        }) as Promise<any>,
        "category"
      ),
      safeGroupBy(
        db.supplier.groupBy({
          by: ["supplierType"],
          where: { organizationId: orgId },
          _count: { _all: true },
        }) as Promise<any>,
        "supplierType"
      ),
      safeGroupBy(
        db.supplier.groupBy({
          by: ["complianceStatus"],
          where: { organizationId: orgId },
          _count: { _all: true },
        }) as Promise<any>,
        "complianceStatus"
      ),
    ]);

    // ---- Documents: expiring (within 30 days) & expired (resilient) ----
    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(now.getDate() + 30);

    let expiringDocsCount = 0;
    let expiredDocsCount = 0;
    try {
      const docs = await db.supplierDocument.findMany({
        where: {
          supplier: { organizationId: orgId },
          expiryDate: { not: null },
        },
        select: { expiryDate: true },
      });
      for (const d of docs) {
        if (!d.expiryDate) continue;
        const exp = new Date(d.expiryDate);
        if (exp < now) expiredDocsCount += 1;
        else if (exp <= in30Days) expiringDocsCount += 1;
      }
    } catch (err) {
      console.error("[stats] document expiry query failed:", err);
    }

    return NextResponse.json({
      totalSuppliers,
      byStatus: {
        active: activeCount,
        pending_verification: pendingVerificationCount,
        suspended: suspendedCount,
        inactive: inactiveCount,
      },
      preferred: preferredCount,
      byCategory,
      byType,
      byCompliance,
      totalSpend: totalSpendValue,
      totalOrders: totalOrdersValue,
      pendingPOs,
      pendingDeliveries,
      expiringDocs: expiringDocsCount,
      expiredDocs: expiredDocsCount,
    });
  } catch (err: any) {
    console.error("[GET /api/suppliers/stats] failed:", err);
    return NextResponse.json(
      { error: "Failed to compute supplier stats", detail: err?.message },
      { status: 500 }
    );
  }
}
