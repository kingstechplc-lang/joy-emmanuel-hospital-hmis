// =====================================================================
// API: /api/stock-transfers/stats
//   GET — Dashboard stats for the Stock Transfers module.
//   Query: facilityId (defaults to session facility), direction (from|to|both)
//
//   Returns:
//     totals: { total, draft, pending_approval, approved, preparing,
//               dispatched, in_transit, partially_received, received,
//               completed, cancelled, on_hold, discrepancy, overdue }
//     financial: { totalQuantity, totalValue }
//     byType, byPriority, byFacility (top 10)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const CLOSED_STATUSES = new Set([
  "received",
  "verified",
  "completed",
  "cancelled",
  "rejected",
  "discrepancy",
]);

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
    const facilityId =
      url.searchParams.get("facilityId") || session.user.facilityId || undefined;
    const direction = url.searchParams.get("direction") || "both";

    const where: any = {};
    if (facilityId) {
      if (direction === "from") where.fromFacilityId = facilityId;
      else if (direction === "to") where.toFacilityId = facilityId;
      else where.OR = [{ fromFacilityId: facilityId }, { toFacilityId: facilityId }];
    }

    let transfers: any[] = [];
    try {
      transfers = await db.stockTransfer.findMany({
        where,
        select: {
          id: true,
          status: true,
          priority: true,
          transferType: true,
          totalQuantity: true,
          totalValue: true,
          expectedDeliveryDate: true,
          createdAt: true,
          fromFacility: { select: { id: true, name: true } },
          toFacility: { select: { id: true, name: true } },
        },
      });
    } catch (e) {
      console.error("stock-transfers stats query failed:", e);
      return NextResponse.json(emptyStats());
    }

    const statusCounts: Record<string, number> = {
      draft: 0,
      pending_approval: 0,
      approved: 0,
      rejected: 0,
      preparing: 0,
      ready_for_dispatch: 0,
      dispatched: 0,
      in_transit: 0,
      partially_received: 0,
      received: 0,
      verified: 0,
      completed: 0,
      cancelled: 0,
      on_hold: 0,
      discrepancy: 0,
    };
    const priorityCounts: Record<string, number> = {
      low: 0,
      normal: 0,
      high: 0,
      urgent: 0,
      emergency: 0,
    };
    const typeCounts: Record<string, number> = {
      internal: 0,
      department: 0,
      pharmacy: 0,
      facility: 0,
      central_warehouse: 0,
      emergency: 0,
      return: 0,
    };
    const facilityMap = new Map<
      string,
      { id: string; name: string; asSource: number; asDest: number; value: number }
    >();

    let totalQuantity = 0;
    let totalValue = 0;
    let overdueCount = 0;

    for (const t of transfers) {
      const st = t.status || "draft";
      if (statusCounts[st] !== undefined) statusCounts[st]++;
      else statusCounts[st] = (statusCounts[st] || 0) + 1;

      const pr = t.priority || "normal";
      priorityCounts[pr] = (priorityCounts[pr] || 0) + 1;

      const tt = t.transferType || "internal";
      typeCounts[tt] = (typeCounts[tt] || 0) + 1;

      totalQuantity += num(t.totalQuantity);
      totalValue += num(t.totalValue);

      if (
        t.expectedDeliveryDate &&
        !CLOSED_STATUSES.has(st) &&
        st !== "on_hold" &&
        new Date(t.expectedDeliveryDate).getTime() < Date.now()
      ) {
        overdueCount++;
      }

      if (t.fromFacility) {
        const k = t.fromFacility.id || "unknown";
        const cur = facilityMap.get(k) || {
          id: k,
          name: t.fromFacility.name || "Unknown",
          asSource: 0,
          asDest: 0,
          value: 0,
        };
        cur.asSource++;
        cur.value += num(t.totalValue);
        facilityMap.set(k, cur);
      }
      if (t.toFacility) {
        const k = t.toFacility.id || "unknown";
        const cur = facilityMap.get(k) || {
          id: k,
          name: t.toFacility.name || "Unknown",
          asSource: 0,
          asDest: 0,
          value: 0,
        };
        cur.asDest++;
        facilityMap.set(k, cur);
      }
    }

    const byType = Object.entries(typeCounts)
      .filter(([, c]) => c > 0)
      .map(([type, count]) => ({ type, count }));
    const byPriority = Object.entries(priorityCounts).map(([priority, count]) => ({
      priority,
      count,
    }));
    const byFacility = Array.from(facilityMap.values())
      .sort((a, b) => b.asSource + b.asDest - (a.asSource + a.asDest))
      .slice(0, 10);

    return NextResponse.json({
      totals: {
        total: transfers.length,
        draft: statusCounts.draft || 0,
        pending_approval: statusCounts.pending_approval || 0,
        approved: statusCounts.approved || 0,
        preparing: statusCounts.preparing || 0,
        ready_for_dispatch: statusCounts.ready_for_dispatch || 0,
        dispatched: statusCounts.dispatched || 0,
        in_transit: statusCounts.in_transit || 0,
        partially_received: statusCounts.partially_received || 0,
        received: statusCounts.received || 0,
        verified: statusCounts.verified || 0,
        completed: statusCounts.completed || 0,
        cancelled: statusCounts.cancelled || 0,
        on_hold: statusCounts.on_hold || 0,
        discrepancy: statusCounts.discrepancy || 0,
        rejected: statusCounts.rejected || 0,
        overdue: overdueCount,
      },
      financial: {
        totalQuantity,
        totalValue: +totalValue.toFixed(2),
      },
      byType,
      byPriority,
      byFacility,
    });
  } catch (err: any) {
    console.error("GET /api/stock-transfers/stats error:", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}

function emptyStats() {
  return {
    totals: {
      total: 0, draft: 0, pending_approval: 0, approved: 0, preparing: 0,
      ready_for_dispatch: 0, dispatched: 0, in_transit: 0, partially_received: 0,
      received: 0, verified: 0, completed: 0, cancelled: 0, on_hold: 0,
      discrepancy: 0, rejected: 0, overdue: 0,
    },
    financial: { totalQuantity: 0, totalValue: 0 },
    byType: [],
    byPriority: [],
    byFacility: [],
  };
}
