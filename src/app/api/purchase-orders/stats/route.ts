// =====================================================================
// API: /api/purchase-orders/stats
//   GET — Dashboard stats for the Purchase Orders module.
//   Query: facilityId (defaults to session facility)
//
//   Returns:
//     - Status breakdown (count per status)
//     - Priority breakdown
//     - Financial rollups (total value, outstanding, received, invoiced, paid)
//     - Per-supplier and per-facility breakdowns (top 10)
//     - Overdue count
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const CLOSED_STATUSES = ["closed", "cancelled", "fully_received", "rejected", "expired"];

// Safe number helper — guards against null/undefined/NaN
const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;

    const where: any = {};
    if (facilityId) where.facilityId = facilityId;

    // 1) Total + status counts (single aggregated query)
    let pos: any[] = [];
    try {
      pos = await db.purchaseOrder.findMany({
        where,
        select: {
          id: true,
          status: true,
          priority: true,
          total: true,
          totalReceived: true,
          totalInvoiced: true,
          totalPaid: true,
          supplierId: true,
          facilityId: true,
          expectedDeliveryDate: true,
          createdAt: true,
          supplier: { select: { id: true, name: true } },
          facility: { select: { id: true, name: true } },
        },
      });
    } catch (e) {
      console.error("purchase-orders stats query failed:", e);
      // Resilient: return empty stats instead of crashing
      return NextResponse.json({
        totals: {
          total: 0, draft: 0, pending_approval: 0, approved: 0, sent_to_supplier: 0,
          acknowledged: 0, partially_received: 0, fully_received: 0, cancelled: 0,
          on_hold: 0, closed: 0, rejected: 0, overdue: 0,
        },
        financial: { totalValue: 0, outstandingValue: 0, totalReceived: 0, totalInvoiced: 0, totalPaid: 0 },
        bySupplier: [], byFacility: [], byPriority: [],
      });
    }

    // 2) Aggregate in-memory (resilient, no fragile SQL)
    const statusCounts: Record<string, number> = {
      draft: 0, pending_approval: 0, approved: 0, rejected: 0,
      sent_to_supplier: 0, acknowledged: 0,
      partially_received: 0, fully_received: 0,
      partially_invoiced: 0, fully_invoiced: 0,
      partially_paid: 0, fully_paid: 0,
      closed: 0, cancelled: 0, on_hold: 0, expired: 0,
    };
    const priorityCounts: Record<string, number> = {
      low: 0, normal: 0, high: 0, urgent: 0, emergency: 0,
    };
    const supplierMap = new Map<string, { id: string; name: string; count: number; value: number }>();
    const facilityMap = new Map<string, { id: string; name: string; count: number; value: number }>();

    let totalValue = 0;
    let totalReceived = 0;
    let totalInvoiced = 0;
    let totalPaid = 0;
    let overdueCount = 0;

    for (const p of pos) {
      const st = p.status || "draft";
      statusCounts[st] = (statusCounts[st] || 0) + 1;

      const pr = p.priority || "normal";
      priorityCounts[pr] = (priorityCounts[pr] || 0) + 1;

      const t = num(p.total);
      totalValue += t;
      totalReceived += num(p.totalReceived);
      totalInvoiced += num(p.totalInvoiced);
      totalPaid += num(p.totalPaid);

      // overdue?
      if (
        p.expectedDeliveryDate &&
        !CLOSED_STATUSES.includes(st) &&
        new Date(p.expectedDeliveryDate).getTime() < Date.now()
      ) {
        overdueCount++;
      }

      // supplier breakdown
      if (p.supplier) {
        const sKey = p.supplier.id || "unknown";
        const sCur = supplierMap.get(sKey) || { id: sKey, name: p.supplier.name || "Unknown", count: 0, value: 0 };
        sCur.count++;
        sCur.value += t;
        supplierMap.set(sKey, sCur);
      }
      // facility breakdown
      if (p.facility) {
        const fKey = p.facility.id || "unknown";
        const fCur = facilityMap.get(fKey) || { id: fKey, name: p.facility.name || "Unknown", count: 0, value: 0 };
        fCur.count++;
        fCur.value += t;
        facilityMap.set(fKey, fCur);
      }
    }

    const outstandingValue = Math.max(0, totalValue - totalPaid);

    const bySupplier = Array.from(supplierMap.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    const byFacility = Array.from(facilityMap.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    const byPriority = Object.entries(priorityCounts).map(([priority, count]) => ({ priority, count }));

    return NextResponse.json({
      totals: {
        total: pos.length,
        draft: statusCounts.draft || 0,
        pending_approval: statusCounts.pending_approval || 0,
        approved: statusCounts.approved || 0,
        sent_to_supplier: statusCounts.sent_to_supplier || 0,
        acknowledged: statusCounts.acknowledged || 0,
        partially_received: statusCounts.partially_received || 0,
        fully_received: statusCounts.fully_received || 0,
        cancelled: statusCounts.cancelled || 0,
        on_hold: statusCounts.on_hold || 0,
        closed: statusCounts.closed || 0,
        rejected: statusCounts.rejected || 0,
        overdue: overdueCount,
      },
      financial: {
        totalValue: +totalValue.toFixed(2),
        outstandingValue: +outstandingValue.toFixed(2),
        totalReceived: +totalReceived.toFixed(2),
        totalInvoiced: +totalInvoiced.toFixed(2),
        totalPaid: +totalPaid.toFixed(2),
      },
      bySupplier,
      byFacility,
      byPriority,
    });
  } catch (err: any) {
    console.error("GET /api/purchase-orders/stats error:", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
