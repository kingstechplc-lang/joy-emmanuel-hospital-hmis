// =====================================================================
// API: /api/refunds/export
//   GET — export refunds as CSV.
//   Columns: Refund #, Patient, Patient #, Payment #, Invoice #, Type,
//            Method, Amount, Approved Amount, Processed Amount, Status,
//            Reason, Requested By, Approved By, Processed By,
//            Created At, Facility
//   Filters: facilityId, status, refundType, refundMethod, from, to, q
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

const USER_SELECT = { id: true, firstName: true, lastName: true } as const;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const refundType = url.searchParams.get("refundType");
  const refundMethod = url.searchParams.get("refundMethod");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q")?.trim();

  // Default date range = last 30 days
  const effectiveFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const effectiveTo = to || new Date().toISOString().slice(0, 10);

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (refundType) where.refundType = refundType;
  if (refundMethod) where.refundMethod = refundMethod;
  where.createdAt = {
    gte: new Date(`${effectiveFrom}T00:00:00`),
    lte: new Date(`${effectiveTo}T23:59:59.999`),
  };

  // Free-text search by refund #, payment #, invoice #, patient name
  if (q) {
    where.OR = [
      { refundNumber: { contains: q, mode: "insensitive" } },
      { reason: { contains: q, mode: "insensitive" } },
      { externalReference: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      {
        payment: {
          OR: [
            { paymentNumber: { contains: q, mode: "insensitive" } },
            {
              patient: {
                OR: [
                  { patientNumber: { contains: q, mode: "insensitive" } },
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          ],
        },
      },
      {
        invoice: {
          invoiceNumber: { contains: q, mode: "insensitive" },
        },
      },
      {
        patient: {
          OR: [
            { patientNumber: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  let items: any[] = [];
  try {
    items = await db.refund.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: {
        payment: {
          select: {
            id: true, paymentNumber: true,
            patient: { select: { patientNumber: true, firstName: true, lastName: true } },
            invoice: { select: { invoiceNumber: true } },
          },
        },
        invoice: { select: { invoiceNumber: true } },
        requestedBy: { select: USER_SELECT },
        approvedBy: { select: USER_SELECT },
        processedBy: { select: USER_SELECT },
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to export refunds" }, { status: 500 });
  }

  const headers = [
    "Refund #",
    "Patient",
    "Patient #",
    "Payment #",
    "Invoice #",
    "Type",
    "Method",
    "Amount",
    "Approved Amount",
    "Processed Amount",
    "Status",
    "Reason",
    "Requested By",
    "Approved By",
    "Processed By",
    "Created At",
    "Facility",
  ];

  const rows = items.map((r) => {
    // Patient is accessed via payment.patient (Refund has patientId only, no relation)
    const patient = r.payment?.patient;
    const patientName = patient
      ? `${patient.firstName || ""} ${patient.lastName || ""}`.trim()
      : "";
    const patientNumber = patient?.patientNumber || "";
    const paymentNumber = r.payment?.paymentNumber || "";
    const invoiceNumber = r.invoice?.invoiceNumber || r.payment?.invoice?.invoiceNumber || "";
    return [
      r.refundNumber || r.id.slice(-8).toUpperCase(),
      patientName,
      patientNumber,
      paymentNumber,
      invoiceNumber,
      (r.refundType || "").replace(/_/g, " "),
      (r.refundMethod || "").replace(/_/g, " "),
      Number(r.amount || 0).toFixed(2),
      r.approvedAmount != null ? Number(r.approvedAmount).toFixed(2) : "",
      r.processedAmount != null ? Number(r.processedAmount).toFixed(2) : "",
      r.status || "",
      r.reason || "",
      r.requestedBy ? `${r.requestedBy.firstName || ""} ${r.requestedBy.lastName || ""}`.trim() : "",
      r.approvedBy ? `${r.approvedBy.firstName || ""} ${r.approvedBy.lastName || ""}`.trim() : "",
      r.processedBy ? `${r.processedBy.firstName || ""} ${r.processedBy.lastName || ""}`.trim() : "",
      r.createdAt ? new Date(r.createdAt).toISOString() : "",
      r.facilityId || "",
    ].map(csvEscape).join(",");
  });

  const csv = [
    `# Refund Export — ${effectiveFrom} to ${effectiveTo}`,
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
      "Content-Disposition": `attachment; filename="refunds-${effectiveFrom}-to-${effectiveTo}.csv"`,
    },
  });
}
