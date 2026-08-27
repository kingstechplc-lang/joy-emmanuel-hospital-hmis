// =====================================================================
// API: /api/refunds/stats
//   GET — refunds dashboard statistics:
//     • Total refunds (count + value)
//     • Counts by lifecycle status: pending, reviewed, approved,
//       processing, completed, rejected, cancelled, reversed, failed
//     • Today / week / month counts + amounts
//     • Breakdown by refundType, by refundMethod, by refundSource
//     • Total refund value (sum of processedAmount on completed)
//     • Pending refund value (sum of amount on pending/reviewed/approved)
//
//   All queries use resilient safeCount / safeAggregate / safeGroupBy
//   helpers — a single failure won't break the dashboard. Filters by
//   facilityId (query param or session facility).
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
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;

  // -----------------------------------------------------------------
  // Resilient helpers — never throw
  // -----------------------------------------------------------------
  const safeCount = async (w: any): Promise<number> => {
    try {
      return await db.refund.count({ where: w });
    } catch {
      return 0;
    }
  };

  const safeAggregate = async (w: any, field: string = "amount"): Promise<{ count: number; total: number }> => {
    try {
      const res = await db.refund.aggregate({
        where: w,
        _count: true,
        _sum: { [field]: true },
      });
      return {
        count: (res._count as any) ?? 0,
        total: (res._sum as any)?.[field] ?? 0,
      };
    } catch {
      return { count: 0, total: 0 };
    }
  };

  const safeGroupBy = async (
    field: "refundType" | "refundMethod" | "refundSource" | "status",
    w: any,
    sumField: string = "amount"
  ): Promise<{ label: string; count: number; total: number }[]> => {
    try {
      const opts: any = { by: [field], where: w, _count: true, _sum: { [sumField]: true } };
      const rows = await db.refund.groupBy(opts);
      return rows.map((r: any) => ({
        label: r[field] || "unknown",
        count: r._count ?? 0,
        total: (r._sum as any)?.[sumField] ?? 0,
      }));
    } catch {
      return [];
    }
  };

  // -----------------------------------------------------------------
  // Time-window filters (on createdAt)
  // -----------------------------------------------------------------
  const now = new Date();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  const todayRange = { gte: todayStart, lte: todayEnd };
  const weekRange = { gte: weekStart };
  const monthRange = { gte: monthStart };

  // -----------------------------------------------------------------
  // Lifecycle status counts + amounts
  // -----------------------------------------------------------------
  const LIFECYCLE_STATUSES = [
    "pending", "reviewed", "approved", "processing",
    "completed", "rejected", "cancelled", "reversed", "failed",
  ];

  const statusAggregates = await Promise.all(
    LIFECYCLE_STATUSES.map((s) => safeAggregate({ ...where, status: s }))
  );

  const byStatus: Record<string, { count: number; total: number }> = {};
  LIFECYCLE_STATUSES.forEach((s, i) => {
    byStatus[s] = statusAggregates[i];
  });

  // -----------------------------------------------------------------
  // Total refunds (count + value)
  // -----------------------------------------------------------------
  const [totalCountObj, totalAmountObj] = await Promise.all([
    safeCount(where),
    safeAggregate(where, "amount"),
  ]);

  // -----------------------------------------------------------------
  // Today / week / month counts + amounts
  // -----------------------------------------------------------------
  const [todayAgg, weekAgg, monthAgg] = await Promise.all([
    safeAggregate({ ...where, createdAt: todayRange }),
    safeAggregate({ ...where, createdAt: weekRange }),
    safeAggregate({ ...where, createdAt: monthRange }),
  ]);

  // -----------------------------------------------------------------
  // Total refund value (sum of processedAmount on completed refunds)
  // Pending refund value (sum of amount on pending/reviewed/approved)
  // -----------------------------------------------------------------
  const [totalRefundValueAgg, pendingValueAgg] = await Promise.all([
    safeAggregate({ ...where, status: "completed" }, "processedAmount"),
    safeAggregate({ ...where, status: { in: ["pending", "reviewed", "approved"] } }, "amount"),
  ]);

  // -----------------------------------------------------------------
  // Breakdowns by refundType, refundMethod, refundSource
  // -----------------------------------------------------------------
  const [byType, byMethod, bySource] = await Promise.all([
    safeGroupBy("refundType", where),
    safeGroupBy("refundMethod", where),
    safeGroupBy("refundSource", where),
  ]);

  return NextResponse.json({
    facilityId: facilityId || null,
    generatedAt: now.toISOString(),
    totals: {
      count: totalCountObj,
      amount: totalAmountObj.total,
      refundValue: totalRefundValueAgg.total, // processed refunds value
      pendingValue: pendingValueAgg.total,    // requested but not yet processed
    },
    byStatus,
    windows: {
      today: { count: todayAgg.count, total: todayAgg.total },
      week: { count: weekAgg.count, total: weekAgg.total },
      month: { count: monthAgg.count, total: monthAgg.total },
    },
    byType,
    byMethod,
    bySource,
  });
}
