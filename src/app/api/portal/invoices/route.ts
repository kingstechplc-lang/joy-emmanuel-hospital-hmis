// =====================================================================
// API: /api/portal/invoices
//   GET — list invoices for the authenticated patient (excluding draft
//         and voided — patients only see "issued" and beyond)
//
// Authorization: Bearer <portal-jwt>
//
// Query params:
//   ?status=unpaid    — outstanding balance > 0
//   ?status=paid       — fully paid
//   (default)          — all visible invoices, newest first
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalSessionFromRequest } from "@/lib/patient-portal/jwt";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Statuses visible to patients — drafts and voided are hidden
const PATIENT_VISIBLE_STATUSES = [
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
  "refunded",
];

export async function GET(req: Request) {
  const session = await getPortalSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.patientId) {
    return NextResponse.json(
      {
        error: "Account pending identity verification",
        needsIdentity: true,
      },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") || "all";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));

  const where: any = {
    patientId: session.patientId,
    status: { in: PATIENT_VISIBLE_STATUSES },
  };
  if (statusFilter === "unpaid") {
    where.balance = { gt: 0 };
  } else if (statusFilter === "paid") {
    where.status = "paid";
    where.balance = 0;
  }

  const invoices = await db.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      invoiceNumber: true,
      invoiceType: true,
      status: true,
      total: true,
      amountPaid: true,
      balance: true,
      createdAt: true,
      issuedAt: true,
      dueDate: true,
      facility: {
        select: { id: true, name: true, code: true },
      },
      // Don't expose insurance/nhis responsibility breakdown for v1
      // (patients see total + balance only — payer-side detail is staff-only)
      _count: {
        select: { payments: true },
      },
    },
  });

  // Total outstanding balance across all visible invoices
  const outstandingAggregate = await db.invoice.aggregate({
    where: {
      patientId: session.patientId,
      status: { in: PATIENT_VISIBLE_STATUSES },
      balance: { gt: 0 },
    },
    _sum: { balance: true },
  });
  const totalOutstanding = outstandingAggregate._sum.balance || 0;

  return NextResponse.json({
    items: invoices,
    count: invoices.length,
    totalOutstanding,
  });
}
