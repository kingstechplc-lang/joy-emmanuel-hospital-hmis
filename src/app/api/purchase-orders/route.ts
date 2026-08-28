// =====================================================================
// API: /api/purchase-orders
//   GET  — list POs (facility-scoped) with filters & isOverdue computation
//   POST — create new PO with items (transactional, full lifecycle)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextPurchaseOrderNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Statuses that should NOT be considered overdue (regardless of dates)
const CLOSED_STATUSES = new Set([
  "closed",
  "cancelled",
  "fully_received",
  "rejected",
  "expired",
]);

function computeOverdue(po: { expectedDeliveryDate?: Date | null; status: string }): boolean {
  if (!po?.expectedDeliveryDate) return false;
  if (CLOSED_STATUSES.has(po.status)) return false;
  return new Date(po.expectedDeliveryDate).getTime() < Date.now();
}

// GET /api/purchase-orders?facilityId=&status=&priority=&supplierId=&from=&to=&q=
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
        take: 500,
        include: {
          supplier: { select: { id: true, name: true, code: true, phone: true } },
          facility: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
          requestedBy: { select: { id: true, firstName: true, lastName: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              inventoryItem: { select: { id: true, name: true, sku: true, unit: true } },
            },
          },
          goodsReceived: { orderBy: { receivedAt: "desc" }, take: 5 },
          _count: { select: { items: true, goodsReceived: true } },
        },
      });
    } catch (e) {
      console.error("purchase-orders GET query failed:", e);
      return NextResponse.json({ items: [], count: 0, error: "Query failed" }, { status: 200 });
    }

    // Compute isOverdue for each PO (resilient — guard against bad dates)
    const items = pos.map((p) => ({
      ...p,
      isOverdue: computeOverdue(p),
    }));

    return NextResponse.json({ items, count: items.length });
  } catch (err: any) {
    console.error("GET /api/purchase-orders error:", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}

// POST /api/purchase-orders
// Body: {
//   facilityId, supplierId, departmentId?, priority?, expectedDeliveryDate?,
//   paymentTerms?, deliveryTerms?, shippingAddress?, deliveryContact?,
//   deliveryPhone?, shippingMethod?, supplierReference?, trackingNumber?,
//   notes?, termsAndConditions?, isEmergency?, emergencyReason?, currency?,
//   items: [{ inventoryItemId?, description?, category?, unit?, quantity, unitPrice, discount?, taxRate? }],
//   status?
// }
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

  const {
    facilityId,
    supplierId,
    departmentId,
    priority,
    expectedDeliveryDate,
    actualDeliveryDate,
    currency,
    paymentTerms,
    deliveryTerms,
    shippingAddress,
    deliveryContact,
    deliveryPhone,
    shippingMethod,
    supplierReference,
    trackingNumber,
    notes,
    termsAndConditions,
    isEmergency,
    emergencyReason,
    items,
    status,
  } = body || {};

  if (!facilityId) return NextResponse.json({ error: "facilityId is required" }, { status: 400 });
  if (!supplierId) return NextResponse.json({ error: "supplierId is required" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "At least one PO item is required" }, { status: 400 });
  }

  // Validate supplier belongs to org
  try {
    const supplier = await db.supplier.findFirst({
      where: { id: supplierId, organizationId: session.user.organizationId },
    });
    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  } catch (e) {
    console.error("supplier lookup failed:", e);
    return NextResponse.json({ error: "Supplier lookup failed" }, { status: 500 });
  }

  // Auto-generate PO number
  let purchaseOrderNumber: string;
  try {
    purchaseOrderNumber = await nextPurchaseOrderNumber(facilityId);
  } catch (e) {
    console.error("nextPurchaseOrderNumber failed:", e);
    return NextResponse.json({ error: "Failed to generate PO number" }, { status: 500 });
  }

  // Compute line totals + subtotal/tax/total
  let subtotal = 0;
  let taxTotal = 0;
  const computedItems = items.map((it: any) => {
    const qty = Math.max(0, Math.floor(Number(it.quantity) || 0));
    const price = Math.max(0, Number(it.unitPrice) || 0);
    const discount = Math.max(0, Number(it.discount) || 0);
    const taxRate = Math.max(0, Number(it.taxRate) || 0);
    const gross = qty * price;
    const net = Math.max(0, gross - discount);
    const taxAmount = +(net * (taxRate / 100)).toFixed(4);
    const lineTotal = +(net + taxAmount).toFixed(4);
    subtotal += gross;
    taxTotal += taxAmount;
    return {
      inventoryItemId: it.inventoryItemId || null,
      description: it.description || null,
      category: it.category || null,
      unit: it.unit || null,
      quantity: qty,
      unitPrice: price,
      discount,
      taxRate,
      taxAmount,
      total: net, // legacy: net of discount, no tax
      lineTotal,
    };
  });

  const totalAmount = +(subtotal - computedItems.reduce((s, it) => s + it.discount, 0) + taxTotal).toFixed(4);
  const finalSubtotal = +subtotal.toFixed(4);
  const finalTax = +taxTotal.toFixed(4);

  // Transactional create
  let po: any;
  try {
    po = await db.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          facilityId,
          supplierId,
          purchaseOrderNumber,
          status: status || "draft",
          subtotal: finalSubtotal,
          tax: finalTax,
          total: totalAmount,
          requestedById: session.user.id,
          // Optional commercial / delivery fields
          departmentId: departmentId || null,
          priority: priority || "normal",
          expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
          actualDeliveryDate: actualDeliveryDate ? new Date(actualDeliveryDate) : null,
          currency: currency || "GHS",
          paymentTerms: paymentTerms || null,
          deliveryTerms: deliveryTerms || null,
          shippingAddress: shippingAddress || null,
          deliveryContact: deliveryContact || null,
          deliveryPhone: deliveryPhone || null,
          shippingMethod: shippingMethod || null,
          supplierReference: supplierReference || null,
          trackingNumber: trackingNumber || null,
          notes: notes || null,
          termsAndConditions: termsAndConditions || null,
          isEmergency: !!isEmergency,
          emergencyReason: emergencyReason || null,
          submittedAt: (status && status !== "draft") ? new Date() : null,
          items: {
            create: computedItems.map((it) => ({
              inventoryItemId: it.inventoryItemId,
              description: it.description,
              category: it.category,
              unit: it.unit,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              discount: it.discount,
              taxRate: it.taxRate,
              taxAmount: it.taxAmount,
              total: it.total,
              lineTotal: it.lineTotal,
              receivedQuantity: 0,
              rejectedQuantity: 0,
              invoicedQuantity: 0,
              paidQuantity: 0,
            })),
          },
        },
        include: { items: true },
      });

      return created;
    });
  } catch (e: any) {
    console.error("purchase-order create failed:", e);
    return NextResponse.json({ error: e?.message || "Failed to create PO" }, { status: 500 });
  }

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
      subtotal: finalSubtotal,
      tax: finalTax,
      total: totalAmount,
      priority: priority || "normal",
      itemCount: computedItems.length,
      isEmergency: !!isEmergency,
    },
  });

  return NextResponse.json({ item: po }, { status: 201 });
}
