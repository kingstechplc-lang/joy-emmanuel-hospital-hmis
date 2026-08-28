// =====================================================================
// API: /api/purchase-orders/export
//   GET — CSV export of purchase orders (facility-scoped).
//   Query: facilityId, status, priority, supplierId, from, to, q
//
//   Columns:
//     PO Number, Supplier, Facility, Date, Expected Delivery, Priority,
//     Status, Subtotal, Tax, Total, Received, Invoiced, Paid,
//     Outstanding, Currency
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const CLOSED_STATUSES = new Set(["closed", "cancelled", "fully_received", "rejected", "expired"]);

function csvEscape(val: any): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function dateOnly(d: Date | string | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
    const status = url.searchParams.get("status") || undefined;
    const priority = url.searchParams.get("priority") || undefined;
    const supplierId = url.searchParams.get("supplierId") || undefined;
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    const q = (url.searchParams.get("q") || "").trim() || undefined;

    const where: any = {};
    if (facilityId) where.facilityId = facilityId;
    if (status && status !== "all") where.status = status;
    if (priority && priority !== "all") where.priority = priority;
    if (supplierId && supplierId !== "all") where.supplierId = supplierId;

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    if (q) {
      where.OR = [
        { purchaseOrderNumber: { contains: q, mode: "insensitive" } },
        { supplierReference: { contains: q, mode: "insensitive" } },
        { trackingNumber: { contains: q, mode: "insensitive" } },
        { supplier: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    let pos: any[] = [];
    try {
      pos = await db.purchaseOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 2000,
        include: {
          supplier: { select: { name: true } },
          facility: { select: { name: true } },
        },
      });
    } catch (e) {
      console.error("purchase-orders export query failed:", e);
      pos = [];
    }

    const header = [
      "PO Number", "Supplier", "Facility", "Date", "Expected Delivery",
      "Priority", "Status", "Subtotal", "Tax", "Total",
      "Received", "Invoiced", "Paid", "Outstanding", "Currency",
    ];

    const rows = pos.map((p) => {
      const total = Number(p.total) || 0;
      const received = Number(p.totalReceived) || 0;
      const invoiced = Number(p.totalInvoiced) || 0;
      const paid = Number(p.totalPaid) || 0;
      const outstanding = Math.max(0, total - paid);
      const overdue =
        p.expectedDeliveryDate &&
        !CLOSED_STATUSES.has(p.status) &&
        new Date(p.expectedDeliveryDate).getTime() < Date.now()
          ? " (OVERDUE)"
          : "";
      return [
        p.purchaseOrderNumber,
        p.supplier?.name || "",
        p.facility?.name || "",
        dateOnly(p.createdAt),
        dateOnly(p.expectedDeliveryDate),
        p.priority || "normal",
        `${p.status}${overdue}`,
        (Number(p.subtotal) || 0).toFixed(2),
        (Number(p.tax) || 0).toFixed(2),
        total.toFixed(2),
        received.toFixed(2),
        invoiced.toFixed(2),
        paid.toFixed(2),
        outstanding.toFixed(2),
        p.currency || "GHS",
      ].map(csvEscape).join(",");
    });

    const csv = [header.map(csvEscape).join(","), ...rows].join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `purchase-orders-${stamp}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("GET /api/purchase-orders/export error:", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
