// =====================================================================
// API: /api/analytics/revenue-cycle
//   GET — Revenue cycle analytics: total revenue, outstanding balance,
//   average days to payment, claim stats, NHIS approval rate, and
//   monthly revenue trend.
//
// Auth: NextAuth staff session, requires PERMISSIONS.REPORT_VIEW.
// Facility-scoped: when session.user.facilityId is set and the user is
//   not a super_admin, results are limited to invoices/claims/payments
//   for that facility.
//
// Query params:
//   ?period=30d|90d|1y|all   (default: 90d)
//
// Returns:
//   {
//     period: "90d",
//     periodStart: "2026-…Z" | null,
//     totalRevenue: number,
//     outstandingBalance: number,
//     avgDaysToPayment: number | null,
//     claimStats: { draft, submitted, approved, denied, paid },
//     nhisApprovalRate: number | null,    // 0-100
//     monthlyRevenue: [{ month, revenue }]
//   }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

type PeriodKey = "30d" | "90d" | "1y" | "all";

function computePeriodStart(period: PeriodKey): Date | null {
  if (period === "all") return null;
  const now = new Date();
  const days = period === "30d" ? 30 : period === "90d" ? 90 : 365;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function ymKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session, PERMISSIONS.REPORT_VIEW)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const rawPeriod = url.searchParams.get("period") as PeriodKey | null;
    const period: PeriodKey =
      rawPeriod === "30d" || rawPeriod === "90d" || rawPeriod === "1y" || rawPeriod === "all"
        ? rawPeriod
        : "90d";

    const periodStart = computePeriodStart(period);
    const isSuperAdmin = session.user.roles.includes("super_admin");
    const facilityId = session.user.facilityId;

    // -----------------------------------------------------------------
    // Base facility-scoped `where` clause for Invoice / Payment /
    // InsuranceClaim (all three have a direct facilityId column).
    // -----------------------------------------------------------------
    const buildWhere = (dateField?: "issuedAt" | "receivedAt" | "createdAt" | "submittedAt") => {
      const w: any = {};
      if (!isSuperAdmin && facilityId) {
        w.facilityId = facilityId;
      }
      if (periodStart && dateField) {
        w[dateField] = { gte: periodStart };
      }
      return w;
    };

    // -----------------------------------------------------------------
    // 1. Total revenue: sum of amountPaid on invoices in the period.
    //    Period filter applied on issuedAt (the financial recognition
    //    date). Invoices with null issuedAt are excluded by the gte.
    // -----------------------------------------------------------------
    const invoiceRevenueWhere = buildWhere("issuedAt");
    const revenueAgg = await db.invoice.aggregate({
      where: invoiceRevenueWhere,
      _sum: { amountPaid: true },
    });
    const totalRevenue = revenueAgg._sum.amountPaid ?? 0;

    // -----------------------------------------------------------------
    // 2. Outstanding balance: sum of `balance` across ALL invoices
    //    (no period filter — this is a current-state metric).
    //    Facility-scoped only.
    // -----------------------------------------------------------------
    const allInvoiceWhere = buildWhere();
    const outstandingAgg = await db.invoice.aggregate({
      where: allInvoiceWhere,
      _sum: { balance: true },
    });
    const outstandingBalance = outstandingAgg._sum.balance ?? 0;

    // -----------------------------------------------------------------
    // 3. Average days to payment.
    //    For each completed Payment in the period, compute
    //      (payment.createdAt - invoice.issuedAt) in days
    //    and average across all such payments. Invoices with null
    //    issuedAt are skipped (can't compute a delta).
    // -----------------------------------------------------------------
    const paymentWhere = buildWhere("receivedAt");
    const payments = await db.payment.findMany({
      where: { ...paymentWhere, status: "completed" },
      select: {
        createdAt: true,
        invoice: { select: { issuedAt: true } },
      },
      take: 5000, // bound memory for "all" period on large facilities
    });
    let daySum = 0;
    let dayN = 0;
    for (const p of payments) {
      if (!p.invoice?.issuedAt) continue;
      const deltaMs =
        new Date(p.createdAt).getTime() - new Date(p.invoice.issuedAt).getTime();
      if (deltaMs < 0) continue; // ignore data-entry inversions
      daySum += deltaMs / DAY_MS;
      dayN += 1;
    }
    const avgDaysToPayment =
      dayN > 0 ? Math.round((daySum / dayN) * 10) / 10 : null;

    // -----------------------------------------------------------------
    // 4. Claim stats by status + NHIS approval rate.
    //    Claim statuses on the model are:
    //      draft | submitted | approved | partially_approved |
    //      rejected | paid | resubmitted
    //    The task spec lists "denied" as a bucket — we treat
    //    InsuranceClaim.status === "rejected" as "denied".
    // -----------------------------------------------------------------
    const claimWhereBase = buildWhere();
    const claimWherePeriod = buildWhere(periodStart ? "createdAt" : undefined);
    const claimWhere = periodStart
      ? { ...claimWhereBase, createdAt: { gte: periodStart } }
      : claimWhereBase;

    const [
      draftCount,
      submittedCount,
      approvedCount,
      rejectedCount,
      paidCount,
      nhisTotal,
      nhisApproved,
    ] = await Promise.all([
      db.insuranceClaim.count({ where: { ...claimWhere, status: "draft" } }),
      db.insuranceClaim.count({ where: { ...claimWhere, status: "submitted" } }),
      db.insuranceClaim.count({
        where: {
          ...claimWhere,
          status: { in: ["approved", "partially_approved"] },
        },
      }),
      db.insuranceClaim.count({ where: { ...claimWhere, status: "rejected" } }),
      db.insuranceClaim.count({ where: { ...claimWhere, status: "paid" } }),
      // NHIS-specific: claims where nhisNumber is set (non-null + non-empty)
      db.insuranceClaim.count({
        where: {
          ...claimWhere,
          nhisNumber: { not: null },
          NOT: { nhisNumber: "" },
        },
      }),
      db.insuranceClaim.count({
        where: {
          ...claimWhere,
          nhisNumber: { not: null },
          NOT: { nhisNumber: "" },
          status: { in: ["approved", "partially_approved", "paid"] },
        },
      }),
    ]);

    const nhisApprovalRate =
      nhisTotal > 0 ? Math.round((nhisApproved / nhisTotal) * 1000) / 10 : null;

    // -----------------------------------------------------------------
    // 5. Monthly revenue trend.
    //    Pull invoices in the period (issuedAt gte periodStart) and
    //    bucket by YYYY-MM(issuedAt), summing amountPaid.
    // -----------------------------------------------------------------
    const trendInvoices = periodStart
      ? await db.invoice.findMany({
          where: invoiceRevenueWhere,
          select: { issuedAt: true, amountPaid: true },
        })
      : [];
    const monthRevenue = new Map<string, number>();
    for (const inv of trendInvoices) {
      if (!inv.issuedAt) continue;
      const key = ymKey(new Date(inv.issuedAt));
      monthRevenue.set(key, (monthRevenue.get(key) ?? 0) + (inv.amountPaid ?? 0));
    }
    const monthlyRevenue = [...monthRevenue.entries()]
      .map(([month, revenue]) => ({
        month,
        revenue: Math.round(revenue * 100) / 100,
      }))
      .sort((a, b) => (a.month < b.month ? -1 : 1));

    return NextResponse.json({
      period,
      periodStart: periodStart ? periodStart.toISOString() : null,
      generatedAt: new Date().toISOString(),
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      outstandingBalance: Math.round(outstandingBalance * 100) / 100,
      avgDaysToPayment,
      claimStats: {
        draft: draftCount,
        submitted: submittedCount,
        approved: approvedCount,
        denied: rejectedCount,
        paid: paidCount,
      },
      nhisApprovalRate,
      monthlyRevenue,
    });
  } catch (e: any) {
    console.error("[GET /api/analytics/revenue-cycle]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to compute revenue cycle analytics" },
      { status: 500 }
    );
  }
}
