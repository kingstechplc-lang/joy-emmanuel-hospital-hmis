// =====================================================================
// API: /api/purchase-orders
//   GET  — list POs (facility-scoped)
//   POST — create new PO with items (transactional)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextPurchaseOrderNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/purchase-orders?facilityId=...&status=...&supplierId=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status") || undefined;
  const supplierId = url.searchParams.get("supplierId") || undefined;

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status && status !== "all") where.status = status;
  if (supplierId) where.supplierId = supplierId;

  const pos = await db.purchaseOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      supplier: { select: { id: true, name: true, code: true, phone: true } },
      facility: { select: { id: true, name: true, code: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      items: {
        include: {
          inventoryItem: { select: { id: true, name: true, sku: true, unit: true } },
        },
      },
      goodsReceived: { orderBy: { receivedAt: "desc" }, take: 5 },
      _count: { select: { items: true, goodsReceived: true } },
    },
  });

  return NextResponse.json({ items: pos, count: pos.length });
}

// POST /api/purchase-orders
// Body: { facilityId, supplierId, items: [{ inventoryItemId, quantity, unitPrice }], notes?, status? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCUREMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { facilityId, supplierId, items, notes, status } = body;

  if (!facilityId) return NextResponse.json({ error: "facilityId is required" }, { status: 400 });
  if (!supplierId) return NextResponse.json({ error: "supplierId is required" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "At least one PO item is required" }, { status: 400 });
  }

  // Validate supplier belongs to org
  const supplier = await db.supplier.findFirst({
    where: { id: supplierId, organizationId: session.user.organizationId },
  });
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const purchaseOrderNumber = await nextPurchaseOrderNumber(facilityId);

  // Compute totals
  let subtotal = 0;
  const computedItems = items.map((it: any) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unitPrice) || 0;
    const total = qty * price;
    subtotal += total;
    return { ...it, quantity: qty, unitPrice: price, total };
  });
  const totalAmount = subtotal;

  // Transactional create
  const po = await db.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: {
        facilityId,
        supplierId,
        purchaseOrderNumber,
        status: status || "draft",
        subtotal,
        tax: 0,
        total: totalAmount,
        requestedById: session.user.id,
        items: {
          create: computedItems.map((it: any) => ({
            inventoryItemId: it.inventoryItemId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            total: it.total,
          })),
        },
      },
      include: { items: true },
    });

    return created;
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "PURCHASE_ORDER_CREATED",
    resourceType: "purchase_order",
    resourceId: po.id,
    newValues: {
      purchaseOrderNumber,
      supplierId,
      subtotal,
      total: totalAmount,
      itemCount: computedItems.length,
    },
  });

  return NextResponse.json({ item: po }, { status: 201 });
}
