// =====================================================================
// API: /api/payments/stats
//   GET — payments dashboard statistics:
//     • Count + amount collected today / this week / this month
//     • Breakdown by payment method (cash, mobile_money, card, bank, insurance, other)
//     • Count by status (completed, pending, failed, reversed)
//     • Pending refunds count + total refund amount pending
//     • Processed refunds count + total refund amount processed
//
//   All queries are wrapped in resilient safeCount / safeAggregate
//   helpers so a single failure won't break the dashboard. Filters by
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
  // Resilient query helpers — never throw, always return safe defaults
  // -----------------------------------------------------------------
  const safeCount = async (w: any): Promise<number> => {
    try {
      return await db.payment.count({ where: w });
    } catch {
      return 0;
    }
  };

  const safeAggregate = async (w: any, field: string = "amount"): Promise<{ count: number; total: number }> => {
    try {
      const res = await db.payment.aggregate({
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
    field: "paymentMethod" | "status",
    w: any,
    sumField?: string
  ): Promise<{ label: string; count: number; total: number }[]> => {
    try {
      const opts: any = { by: [field], where: w, _count: true };
      if (sumField) opts._sum = { [sumField]: true };
      const rows = await db.payment.groupBy(opts);
      return rows.map((r: any) => ({
        label: r[field] || "unknown",
        count: r._count ?? 0,
        total: sumField ? (r._sum?.[sumField] ?? 0) : 0,
      }));
    } catch {
      return [];
    }
  };

  const safeCountRefunds = async (w: any): Promise<number> => {
    try {
      return await db.refund.count({ where: w });
    } catch {
      return 0;
    }
  };

  const safeAggregateRefunds = async (w: any, field: string = "amount"): Promise<number> => {
    try {
      const res = await db.refund.aggregate({
        where: w,
        _sum: { [field]: true },
      });
      return (res._sum as any)?.[field] ?? 0;
    } catch {
      return 0;
    }
  };

  // -----------------------------------------------------------------
  // Time-window filters
  // -----------------------------------------------------------------
  const now = new Date();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  // Week = last 7 days rolling (includes today)
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 6); weekStart.setHours(0, 0, 0, 0);

  // Month = current calendar month (1st to today)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  const todayRange = { gte: todayStart, lte: todayEnd };
  const weekRange = { gte: weekStart };
  const monthRange = { gte: monthStart };

  // Completed payments are the ones that contribute to actual collections
  const completedFilter = { status: "completed" };

  // -----------------------------------------------------------------
  // Counts + amount collected per window
  // -----------------------------------------------------------------
  const [
    todayCount,
    todayAmount,
    weekCount,
    weekAmount,
    monthCount,
    monthAmount,
    totalCount,
    totalAmount,
  ] = await Promise.all([
    safeCount({ ...where, receivedAt: todayRange, ...completedFilter }),
    safeAggregate({ ...where, receivedAt: todayRange, ...completedFilter }),
    safeCount({ ...where, receivedAt: weekRange, ...completedFilter }),
    safeAggregate({ ...where, receivedAt: weekRange, ...completedFilter }),
    safeCount({ ...where, receivedAt: monthRange, ...completedFilter }),
    safeAggregate({ ...where, receivedAt: monthRange, ...completedFilter }),
    safeCount(where),
    safeAggregate(where),
  ]);

  // -----------------------------------------------------------------
  // Breakdown by payment method (counts + totals)
  // -----------------------------------------------------------------
  const byMethodRaw = await safeGroupBy("paymentMethod", { ...where, ...completedFilter }, "amount");

  // Ensure all known methods are present even if zero
  const KNOWN_METHODS = ["cash", "mobile_money", "card", "bank", "insurance", "other"];
  const methodMap = new Map<string, { count: number; total: number }>();
  for (const m of KNOWN_METHODS) methodMap.set(m, { count: 0, total: 0 });
  for (const r of byMethodRaw) {
    methodMap.set(r.label, { count: r.count, total: r.total });
  }
  const byMethod = Array.from(methodMap.entries()).map(([label, v]) => ({ label, count: v.count, total: v.total }));

  // -----------------------------------------------------------------
  // Count by payment status
  // -----------------------------------------------------------------
  const byStatusRaw = await safeGroupBy("status", where, "amount");
  const KNOWN_STATUSES = ["completed", "pending", "failed", "reversed"];
  const statusMap = new Map<string, { count: number; total: number }>();
  for (const s of KNOWN_STATUSES) statusMap.set(s, { count: 0, total: 0 });
  for (const r of byStatusRaw) {
    statusMap.set(r.label, { count: r.count, total: r.total });
  }
  const byStatus = Array.from(statusMap.entries()).map(([label, v]) => ({ label, count: v.count, total: v.total }));

  // -----------------------------------------------------------------
  // Refunds — pending and processed
  // -----------------------------------------------------------------
  const refundWhere: any = {};
  if (facilityId) refundWhere.payment = { facilityId };

  const [pendingRefundsCount, pendingRefundsAmount, processedRefundsCount, processedRefundsAmount] = await Promise.all([
    safeCountRefunds({ ...refundWhere, status: "pending" }),
    safeAggregateRefunds({ ...refundWhere, status: "pending" }),
    safeCountRefunds({ ...refundWhere, status: "processed" }),
    safeAggregateRefunds({ ...refundWhere, status: "processed" }),
  ]);

  return NextResponse.json({
    facilityId: facilityId || null,
    generatedAt: now.toISOString(),
    windows: {
      today: { count: todayCount, total: todayAmount.total },
      week: { count: weekCount, total: weekAmount.total },
      month: { count: monthCount, total: monthAmount.total },
    },
    totals: {
      count: totalCount,
      amount: totalAmount.total,
    },
    byMethod,
    byStatus,
    refunds: {
      pending: { count: pendingRefundsCount, total: pendingRefundsAmount },
      processed: { count: processedRefundsCount, total: processedRefundsAmount },
    },
  });
}
