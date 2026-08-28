// =====================================================================
// API: /api/stock-transfers/export
//   GET — CSV export of stock transfers (facility-scoped).
//   Query: facilityId, direction, transferType, priority, status,
//          from, to, q
//
//   Columns:
//     Transfer Number, Type, From Facility, To Facility, Priority,
//     Status, Total Qty, Total Value, Requested By, Date, Completed
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const CLOSED_STATUSES = new Set([
  "received",
  "verified",
  "completed",
  "cancelled",
  "rejected",
  "discrepancy",
]);

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

function userFullName(u: any): string {
  if (!u) return "";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "";
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const facilityId =
      url.searchParams.get("facilityId") || session.user.facilityId || undefined;
    const direction = url.searchParams.get("direction") || "both";
    const transferType = url.searchParams.get("transferType") || undefined;
    const priority = url.searchParams.get("priority") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    const q = (url.searchParams.get("q") || "").trim() || undefined;

    const where: any = {};
    if (facilityId) {
      if (direction === "from") where.fromFacilityId = facilityId;
      else if (direction === "to") where.toFacilityId = facilityId;
      else where.OR = [{ fromFacilityId: facilityId }, { toFacilityId: facilityId }];
    }
    if (transferType && transferType !== "all") where.transferType = transferType;
    if (priority && priority !== "all") where.priority = priority;
    if (status && status !== "all") where.status = status;

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }

    if (q) {
      where.OR = [
        { transferNumber: { contains: q, mode: "insensitive" } },
        { trackingNumber: { contains: q, mode: "insensitive" } },
        { carrierName: { contains: q, mode: "insensitive" } },
        { fromFacility: { name: { contains: q, mode: "insensitive" } } },
        { toFacility: { name: { contains: q, mode: "insensitive" } } },
        { items: { some: { inventoryItem: { name: { contains: q, mode: "insensitive" } } } } },
      ];
    }

    let transfers: any[] = [];
    try {
      transfers = await db.stockTransfer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 2000,
        include: {
          fromFacility: { select: { name: true } },
          toFacility: { select: { name: true } },
          requestedBy: { select: { firstName: true, lastName: true, username: true } },
        },
      });
    } catch (e) {
      console.error("stock-transfers export query failed:", e);
      transfers = [];
    }

    const header = [
      "Transfer Number",
      "Type",
      "From Facility",
      "To Facility",
      "Priority",
      "Status",
      "Total Qty",
      "Total Value",
      "Requested By",
      "Date",
      "Completed",
    ];

    const rows = transfers.map((t) => {
      const isOverdue =
        t.expectedDeliveryDate &&
        !CLOSED_STATUSES.has(t.status) &&
        new Date(t.expectedDeliveryDate).getTime() < Date.now()
          ? " (OVERDUE)"
          : "";
      return [
        t.transferNumber,
        t.transferType || "internal",
        t.fromFacility?.name || "",
        t.toFacility?.name || "",
        t.priority || "normal",
        `${t.status}${isOverdue}`,
        Number(t.totalQuantity) || 0,
        (Number(t.totalValue) || 0).toFixed(2),
        userFullName(t.requestedBy),
        dateOnly(t.createdAt),
        dateOnly(t.completedAt),
      ].map(csvEscape).join(",");
    });

    const csv = [header.map(csvEscape).join(","), ...rows].join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `stock-transfers-${stamp}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("GET /api/stock-transfers/export error:", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
