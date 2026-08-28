// =====================================================================
// API: /api/stock-transfers
//   GET  — list stock transfers with rich filters + relations
//   POST — create a stock transfer (draft) with full header + line items
//
// Schema (StockTransfer):
//   transferNumber (unique), transferType, priority, from/to Facility,
//   from/to Department, from/to Store, 15-state lifecycle, 9 User
//   relations, dispatch info, return tracking, totals.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Statuses considered "closed" — overdue is only computed for active transfers.
const CLOSED_STATUSES = new Set([
  "received",
  "verified",
  "completed",
  "cancelled",
  "rejected",
  "discrepancy",
]);

function userSel() {
  return { select: { id: true, firstName: true, lastName: true, username: true } };
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeOverdue(t: { expectedDeliveryDate?: Date | string | null; status: string }): boolean {
  if (!t?.expectedDeliveryDate) return false;
  if (CLOSED_STATUSES.has(t.status)) return false;
  return new Date(t.expectedDeliveryDate).getTime() < Date.now();
}

// ----------------------------------------------------------------------
// GET /api/stock-transfers?facilityId=&direction=from|to|both
//   &transferType=&priority=&status=&from=&to=&q=&transferType=
// Includes: fromFacility, toFacility, requestedBy, approvedBy,
//   dispatchedBy, receivedBy, items+inventoryItem. Adds isOverdue.
// ----------------------------------------------------------------------
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
    const direction = url.searchParams.get("direction") || "both"; // from | to | both
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
        // include the entire "to" day
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
        { reason: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
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
        take: 500,
        include: {
          fromFacility: { select: { id: true, name: true, code: true } },
          toFacility: { select: { id: true, name: true, code: true } },
          requestedBy: userSel(),
          approvedBy: userSel(),
          dispatchedBy: userSel(),
          receivedBy: userSel(),
          items: {
            include: {
              inventoryItem: {
                select: {
                  id: true, name: true, sku: true, unit: true, category: true, itemType: true,
                },
              },
            },
          },
          _count: { select: { items: true } },
        },
      });
    } catch (e) {
      console.error("stock-transfers GET query failed:", e);
      transfers = [];
    }

    // Resilient: compute isOverdue + sanitized numeric totals in-memory
    const items = transfers.map((t: any) => ({
      ...t,
      totalQuantity: num(t.totalQuantity),
      totalValue: num(t.totalValue),
      isOverdue: computeOverdue(t),
    }));

    return NextResponse.json({ items, count: items.length });
  } catch (err: any) {
    console.error("GET /api/stock-transfers error:", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}

// ----------------------------------------------------------------------
// POST /api/stock-transfers
// Body:
//   transferType, fromFacilityId, toFacilityId,
//   fromDepartmentId?, toDepartmentId?, fromStoreName?, toStoreName?,
//   priority?, reason?, expectedDeliveryDate?, notes?,
//   items: [{ inventoryItemId, batchId?, requestedQuantity, unitCost? }]
//
// Generates transferNumber ST-YYYY-NNNNNN (unique), status=draft,
// computes totalQuantity + totalValue, audit logs.
// ----------------------------------------------------------------------
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_TRANSFER)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const {
    transferType = "internal",
    fromFacilityId,
    toFacilityId,
    fromDepartmentId,
    toDepartmentId,
    fromStoreName,
    toStoreName,
    priority = "normal",
    reason,
    expectedDeliveryDate,
    notes,
    items,
  } = body;

  // --- Validation ---
  if (!fromFacilityId) return NextResponse.json({ error: "fromFacilityId is required" }, { status: 400 });
  if (!toFacilityId) return NextResponse.json({ error: "toFacilityId is required" }, { status: 400 });
  if (fromFacilityId === toFacilityId) {
    return NextResponse.json({ error: "Source and destination facilities must differ" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "At least one transfer item is required" }, { status: 400 });
  }

  // Validate each line item
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.inventoryItemId) {
      return NextResponse.json({ error: `Line ${i + 1}: inventoryItemId is required` }, { status: 400 });
    }
    const qty = Number(it.requestedQuantity ?? it.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: `Line ${i + 1}: requestedQuantity must be > 0` }, { status: 400 });
    }
  }

  // --- Generate unique transfer number ST-YYYY-NNNNNN ---
  const year = new Date().getFullYear();
  let transferNumber = "";
  let attempts = 0;
  while (attempts < 5) {
    const count = await db.stockTransfer.count({
      where: { transferNumber: { startsWith: `ST-${year}-` } },
    });
    transferNumber = `ST-${year}-${String(count + 1 + attempts).padStart(6, "0")}`;
    const exists = await db.stockTransfer.findUnique({ where: { transferNumber }, select: { id: true } });
    if (!exists) break;
    attempts++;
  }

  // --- Compute totals ---
  let totalQuantity = 0;
  let totalValue = 0;
  const itemRows = items.map((it: any) => {
    const requestedQuantity = Math.max(0, Math.floor(Number(it.requestedQuantity ?? it.quantity) || 0));
    const unitCost = Math.max(0, Number(it.unitCost || 0));
    const lineValue = +(requestedQuantity * unitCost).toFixed(2);
    totalQuantity += requestedQuantity;
    totalValue += lineValue;
    return {
      inventoryItemId: it.inventoryItemId,
      batchId: it.batchId || null,
      description: it.description || null,
      category: it.category || null,
      unit: it.unit || null,
      requestedQuantity,
      approvedQuantity: 0,
      preparedQuantity: 0,
      dispatchedQuantity: 0,
      receivedQuantity: 0,
      rejectedQuantity: 0,
      damagedQuantity: 0,
      unitCost,
      totalValue: lineValue,
      notes: it.notes || null,
    };
  });
  totalValue = +totalValue.toFixed(2);

  try {
    const transfer = await db.stockTransfer.create({
      data: {
        transferNumber,
        transferType: transferType || "internal",
        fromFacilityId,
        toFacilityId,
        fromDepartmentId: fromDepartmentId || null,
        toDepartmentId: toDepartmentId || null,
        fromStoreName: fromStoreName || null,
        toStoreName: toStoreName || null,
        status: "draft",
        priority: priority || "normal",
        reason: reason || null,
        expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
        notes: notes || null,
        requestedById: session.user.id,
        totalQuantity,
        totalValue,
        items: { create: itemRows },
      },
      include: {
        items: {
          include: {
            inventoryItem: {
              select: { id: true, name: true, sku: true, unit: true, category: true, itemType: true },
            },
          },
        },
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: fromFacilityId,
      action: "STOCK_TRANSFER_CREATED",
      resourceType: "stock_transfer",
      resourceId: transfer.id,
      newValues: {
        transferNumber,
        transferType,
        fromFacilityId,
        toFacilityId,
        priority,
        itemCount: itemRows.length,
        totalQuantity,
        totalValue,
      },
    });

    return NextResponse.json({ item: transfer }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/stock-transfers error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to create stock transfer" },
      { status: 500 }
    );
  }
}
