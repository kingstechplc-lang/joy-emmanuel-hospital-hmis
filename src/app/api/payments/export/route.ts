// =====================================================================
// API: /api/payments/export
//   GET — export payments as CSV.
//   Columns: Payment #, Patient, Patient #, Invoice #, Amount, Method,
//            Reference, Status, Received By, Received At, Facility
//   Filters: facilityId, method, status, from, to, q (search)
//   Gated by PERMISSIONS.BILLING_VIEW.
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
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const method = url.searchParams.get("method");
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q")?.trim();

  // Default date range = last 30 days
  const effectiveFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const effectiveTo = to || new Date().toISOString().slice(0, 10);

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (method) where.paymentMethod = method;
  if (status) where.status = status;
  where.receivedAt = {
    gte: new Date(`${effectiveFrom}T00:00:00`),
    lte: new Date(`${effectiveTo}T23:59:59.999`),
  };

  // Free-text search by payment number, patient name, patient number, or invoice number
  if (q) {
    where.OR = [
      { paymentNumber: { contains: q, mode: "insensitive" } },
      { transactionReference: { contains: q, mode: "insensitive" } },
      {
        patient: {
          OR: [
            { patientNumber: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        },
      },
      {
        invoice: {
          invoiceNumber: { contains: q, mode: "insensitive" },
        },
      },
    ];
  }

  let items: any[] = [];
  try {
    items = await db.payment.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: 1000,
      include: {
        patient: { select: { patientNumber: true, firstName: true, lastName: true } },
        facility: { select: { name: true, code: true } },
        invoice: { select: { invoiceNumber: true } },
        receivedBy: { select: { firstName: true, lastName: true } },
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to export payments" }, { status: 500 });
  }

  const headers = [
    "Payment #",
    "Patient",
    "Patient #",
    "Invoice #",
    "Amount",
    "Method",
    "Reference",
    "Status",
    "Received By",
    "Received At",
    "Facility",
  ];

  const rows = items.map((p) => {
    return [
      p.paymentNumber || "",
      `${p.patient?.firstName || ""} ${p.patient?.lastName || ""}`.trim(),
      p.patient?.patientNumber || "",
      p.invoice?.invoiceNumber || "",
      Number(p.amount || 0).toFixed(2),
      (p.paymentMethod || "").replace(/_/g, " "),
      p.transactionReference || "",
      p.status || "",
      p.receivedBy ? `${p.receivedBy.firstName || ""} ${p.receivedBy.lastName || ""}`.trim() : "",
      p.receivedAt ? new Date(p.receivedAt).toISOString() : "",
      p.facility?.name || "",
    ].map(csvEscape).join(",");
  });

  const csv = [
    `# Payment Export — ${effectiveFrom} to ${effectiveTo}`,
    `# Facility: ${facilityId || "All"}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Total records: ${items.length}`,
    "",
    headers.map(csvEscape).join(","),
    ...rows,
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payments-${effectiveFrom}-to-${effectiveTo}.csv"`,
    },
  });
}
