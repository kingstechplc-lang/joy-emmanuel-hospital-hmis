// =====================================================================
// API: /api/invoices/export
//   GET — export invoices as CSV for accounting / reporting.
//   Accepts: facilityId, from, to (YYYY-MM-DD). Defaults to last 30 days.
//   Columns: Invoice #, Patient, Patient #, Type, Payer Type, Status,
//            Subtotal, Discount, Tax, Total, Paid, Refunded, Balance,
//            Currency, Issued At, Due At, Facility
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

function csvEscape(value: any): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString();
  } catch {
    return "";
  }
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "0";
  return Number(n).toFixed(2);
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const from =
    url.searchParams.get("from") ||
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  // Date range based on issuedAt if present, otherwise createdAt
  const fromDt = new Date(`${from}T00:00:00`);
  const toDt = new Date(`${to}T23:59:59.999`);
  where.OR = [{ issuedAt: { gte: fromDt, lte: toDt } }, { issuedAt: null, createdAt: { gte: fromDt, lte: toDt } }];

  let invoices: any[] = [];
  try {
    invoices = await db.invoice.findMany({
      where,
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      include: {
        patient: {
          select: {
            id: true,
            patientNumber: true,
            firstName: true,
            lastName: true,
          },
        },
        facility: { select: { id: true, name: true, code: true } },
      },
      take: 5000,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to fetch invoices for export" },
      { status: 500 }
    );
  }

  const headers = [
    "Invoice #",
    "Patient",
    "Patient #",
    "Type",
    "Payer Type",
    "Status",
    "Subtotal",
    "Discount",
    "Tax",
    "Total",
    "Paid",
    "Refunded",
    "Balance",
    "Currency",
    "Issued At",
    "Due At",
    "Facility",
  ];

  const rows = invoices.map((inv) => {
    return [
      inv.invoiceNumber || "",
      `${inv.patient?.firstName ?? ""} ${inv.patient?.lastName ?? ""}`.trim(),
      inv.patient?.patientNumber || "",
      inv.invoiceType || "patient",
      inv.payerType || "self_pay",
      inv.status || "draft",
      fmtMoney(inv.subtotal),
      fmtMoney(inv.discount),
      fmtMoney(inv.tax),
      fmtMoney(inv.total),
      fmtMoney(inv.amountPaid),
      fmtMoney(inv.amountRefunded),
      fmtMoney(inv.balance),
      inv.currency || "GHS",
      fmtDate(inv.issuedAt),
      fmtDate(inv.dueAt),
      inv.facility?.name || "",
    ]
      .map(csvEscape)
      .join(",");
  });

  const csv = [
    `# Invoice Export — ${from} to ${to}`,
    `# Facility: ${facilityId || "All"}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Total records: ${invoices.length}`,
    "",
    headers.map(csvEscape).join(","),
    ...rows,
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoices-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
