// =====================================================================
// API: /api/invoices/stats
//   GET — billing dashboard statistics: status counts, financial totals,
//         breakdowns by invoiceType & payerType, credit-note & refund
//         pending counts. All queries are resilient (safeCount /
//         safeGroupBy / safeAggregate) so a single failure won't take
//         down the whole dashboard.
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

  const now = new Date();

  // -----------------------------------------------------------------
  // Resilient query helpers — never throw, always return a safe default
  // -----------------------------------------------------------------
  const safeCount = async (w: any): Promise<number> => {
    try {
      return await db.invoice.count({ where: w });
    } catch {
      return 0;
    }
  };

  const safeAggregate = async (w: any, fields: string[]): Promise<Record<string, number>> => {
    try {
      const sumSpec: any = {};
      for (const f of fields) sumSpec[f] = true;
      const res = await db.invoice.aggregate({ where: w, _sum: sumSpec });
      const out: Record<string, number> = {};
      for (const f of fields) out[f] = (res._sum as any)?.[f] ?? 0;
      return out;
    } catch {
      const out: Record<string, number> = {};
      for (const f of fields) out[f] = 0;
      return out;
    }
  };

  const safeGroupBy = async (
    field: "invoiceType" | "payerType" | "status",
    w: any,
    sumField?: string
  ): Promise<{ label: string; count: number; total: number }[]> => {
    try {
      const opts: any = { by: [field], where: w, _count: true };
      if (sumField) opts._sum = { [sumField]: true };
      const rows = await db.invoice.groupBy(opts);
      return rows.map((r: any) => ({
        label: r[field] || "unknown",
        count: r._count ?? 0,
        total: sumField ? (r._sum?.[sumField] ?? 0) : 0,
      }));
    } catch {
      return [];
    }
  };

  const safeCountCreditNotes = async (w: any): Promise<number> => {
    try {
      return await db.creditNote.count({ where: w });
    } catch {
      return 0;
    }
  };

  const safeCountRefunds = async (w: any): Promise<number> => {
    try {
      return await db.refund.count({ where: w });
    } catch {
      return 0;
    }
  };

  // -----------------------------------------------------------------
  // Filter fragments
  // -----------------------------------------------------------------
  const nonCancelled = { status: { notIn: ["cancelled", "voided"] } };
  const overdueWhere = {
    ...where,
    status: { notIn: ["cancelled", "voided", "paid", "written_off", "refunded"] },
    dueAt: { lt: now },
    balance: { gt: 0 },
  };

  // -----------------------------------------------------------------
  // Status counts
  // -----------------------------------------------------------------
  const [
    total,
    draft,
    pendingReview,
    approved,
    issued,
    partiallyPaid,
    paid,
    voided,
    cancelled,
    refunded,
    writtenOff,
    overdueCalculated,
  ] = await Promise.all([
    safeCount(where),
    safeCount({ ...where, status: "draft" }),
    safeCount({ ...where, status: "pending_review" }),
    safeCount({ ...where, status: "approved" }),
    safeCount({ ...where, status: "issued" }),
    safeCount({ ...where, status: "partially_paid" }),
    safeCount({ ...where, status: "paid" }),
    safeCount({ ...where, status: "voided" }),
    safeCount({ ...where, status: "cancelled" }),
    safeCount({ ...where, status: "refunded" }),
    safeCount({ ...where, status: "written_off" }),
    safeCount(overdueWhere),
  ]);

  // -----------------------------------------------------------------
  // Financial totals
  // -----------------------------------------------------------------
  const invoicedSums = await safeAggregate(
    { ...where, ...nonCancelled },
    ["total", "subtotal", "discount", "tax", "amountPaid", "amountRefunded", "amountCredited", "balance"]
  );

  const paidSums = await safeAggregate({ ...where, ...nonCancelled }, ["amountPaid"]);
  const outstandingSums = await safeAggregate(
    { ...where, ...nonCancelled, balance: { gt: 0 } },
    ["balance"]
  );
  const overdueSums = await safeAggregate(overdueWhere, ["balance"]);

  // -----------------------------------------------------------------
  // Breakdowns
  // -----------------------------------------------------------------
  const [byInvoiceType, byPayerType, byStatus] = await Promise.all([
    safeGroupBy("invoiceType", { ...where, ...nonCancelled }, "total"),
    safeGroupBy("payerType", { ...where, ...nonCancelled }, "total"),
    safeGroupBy("status", where, "total"),
  ]);

  // -----------------------------------------------------------------
  // Credit notes & pending refunds
  // -----------------------------------------------------------------
  const creditNoteWhere: any = {};
  if (facilityId) creditNoteWhere.facilityId = facilityId;
  const refundWhere: any = {};
  if (facilityId) refundWhere.invoice = { facilityId };

  const [creditNotesCount, creditNotesIssued, refundsPending] = await Promise.all([
    safeCountCreditNotes(creditNoteWhere),
    safeCountCreditNotes({ ...creditNoteWhere, status: "issued" }),
    safeCountRefunds({ ...refundWhere, status: "pending" }),
  ]);

  return NextResponse.json({
    facilityId: facilityId || null,
    generatedAt: now.toISOString(),
    counts: {
      total,
      draft,
      pending_review: pendingReview,
      approved,
      issued,
      partially_paid: partiallyPaid,
      paid,
      overdue: overdueCalculated,
      voided,
      cancelled,
      refunded,
      written_off: writtenOff,
    },
    totals: {
      invoiced: invoicedSums.total ?? 0,
      subtotal: invoicedSums.subtotal ?? 0,
      discount: invoicedSums.discount ?? 0,
      tax: invoicedSums.tax ?? 0,
      paid: paidSums.amountPaid ?? 0,
      refunded: invoicedSums.amountRefunded ?? 0,
      credited: invoicedSums.amountCredited ?? 0,
      outstanding: outstandingSums.balance ?? 0,
      overdue: overdueSums.balance ?? 0,
    },
    byInvoiceType,
    byPayerType,
    byStatus,
    creditNotes: {
      total: creditNotesCount,
      issued: creditNotesIssued,
    },
    refunds: {
      pending: refundsPending,
    },
  });
}
