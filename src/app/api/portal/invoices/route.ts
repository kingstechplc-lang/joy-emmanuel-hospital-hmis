// =====================================================================
// API: /api/portal/invoices
//   GET — list invoices for the authenticated patient
//
// Authorization: Bearer <portal-jwt>
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalSessionFromRequest } from "@/lib/patient-portal/jwt";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

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

  try {
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
        currency: true,
        createdAt: true,
        issuedAt: true,
        dueAt: true, // ⚠️ was `dueDate` — corrected to `dueAt`
        facility: {
          select: { id: true, name: true, code: true },
        },
        _count: {
          select: { payments: true },
        },
      },
    });

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
  } catch (e: any) {
    console.error("[GET /api/portal/invoices] error:", e);
    return NextResponse.json(
      { error: "Failed to load invoices. Please try again." },
      { status: 500 }
    );
  }
}
