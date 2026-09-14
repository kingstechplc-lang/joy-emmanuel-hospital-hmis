// =====================================================================
// API: /api/portal/invoices
//   GET — list invoices with search + date range + type filters
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalSessionFromRequest } from "@/lib/patient-portal/jwt";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const PATIENT_VISIBLE_STATUSES = ["issued", "partially_paid", "paid", "overdue", "cancelled", "refunded"];

export async function GET(req: Request) {
  const session = await getPortalSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.patientId) {
    return NextResponse.json({ error: "Account pending identity verification", needsIdentity: true }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("search") || "";
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const typeFilter = url.searchParams.get("type") || "";
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

    // Date range
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(`${dateTo}T23:59:59`);
    }

    // Type filter
    if (typeFilter && typeFilter !== "all") {
      where.invoiceType = typeFilter;
    }

    // Search
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
      ];
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
        dueAt: true,
        facility: { select: { id: true, name: true, code: true } },
        _count: { select: { payments: true } },
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

    return NextResponse.json({
      items: invoices,
      count: invoices.length,
      totalOutstanding: outstandingAggregate._sum.balance || 0,
    });
  } catch (e: any) {
    console.error("[GET /api/portal/invoices] error:", e);
    return NextResponse.json(
      { error: "Failed to load invoices", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
