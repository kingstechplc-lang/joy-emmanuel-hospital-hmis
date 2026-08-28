// =====================================================================
// API: /api/purchase-orders/[id]
//   GET    — full PO detail with all relations + computed metrics
//   PATCH  — lifecycle actions:
//              submit, approve, reject, order (legacy alias), send,
//              acknowledge, hold, release, close, revise, cancel, update
//   DELETE — only draft POs
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const CLOSED_STATUSES = new Set([
  "closed",
  "cancelled",
  "fully_received",
  "rejected",
  "expired",
]);

const ACTIVE_STATUSES = new Set([
  "pending_approval",
  "approved",
  "sent_to_supplier",
  "acknowledged",
  "partially_received",
  "fully_received",
  "partially_invoiced",
  "fully_invoiced",
  "partially_paid",
  "fully_paid",
]);

function computeOverdue(po: { expectedDeliveryDate?: Date | null; status: string }): boolean {
  if (!po?.expectedDeliveryDate) return false;
  if (CLOSED_STATUSES.has(po.status)) return false;
  return new Date(po.expectedDeliveryDate).getTime() < Date.now();
}

function userSel() {
  return { select: { id: true, firstName: true, lastName: true, username: true } };
}

// GET /api/purchase-orders/[id]
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let po: any;
  try {
    po = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        facility: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            inventoryItem: true,
          },
        },
        goodsReceived: {
          orderBy: { receivedAt: "desc" },
          include: {
            facility: { select: { name: true } },
            receivedBy: userSel(),
          },
        },
        requestedBy: userSel(),
        approvedBy: userSel(),
        sentBy: userSel(),
        acknowledgedBy: userSel(),
        heldBy: userSel(),
        closedBy: userSel(),
        cancelledBy: userSel(),
        rejectedBy: userSel(),
      },
    });
  } catch (e: any) {
    console.error("purchase-order GET failed:", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }

  if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

  // Computed metrics — resilient
  const totalOrderedQty = (po.items || []).reduce((s: number, it: any) => s + (it.quantity || 0), 0);
  const totalReceivedQty = (po.items || []).reduce((s: number, it: any) => s + (it.receivedQuantity || 0), 0);
  const totalRejectedQty = (po.items || []).reduce((s: number, it: any) => s + (it.rejectedQuantity || 0), 0);
  const totalInvoicedQty = (po.items || []).reduce((s: number, it: any) => s + (it.invoicedQuantity || 0), 0);
  const totalPaidQty = (po.items || []).reduce((s: number, it: any) => s + (it.paidQuantity || 0), 0);

  const poTotal = Number(po.total) || 0;
  const totalReceivedValue = Number(po.totalReceived) || 0;
  const totalInvoicedValue = Number(po.totalInvoiced) || 0;
  const totalPaidValue = Number(po.totalPaid) || 0;
  const outstandingValue = Math.max(0, poTotal - totalPaidValue);

  const receivedPct = totalOrderedQty > 0 ? Math.min(100, Math.round((totalReceivedQty / totalOrderedQty) * 100)) : 0;
  const invoicedPct = poTotal > 0 ? Math.min(100, Math.round((totalInvoicedValue / poTotal) * 100)) : 0;
  const paidPct = poTotal > 0 ? Math.min(100, Math.round((totalPaidValue / poTotal) * 100)) : 0;

  const item = {
    ...po,
    isOverdue: computeOverdue(po),
    metrics: {
      totalOrderedQty,
      totalReceivedQty,
      totalRejectedQty,
      totalInvoicedQty,
      totalPaidQty,
      poTotal,
      totalReceivedValue,
      totalInvoicedValue,
      totalPaidValue,
      outstandingValue,
      receivedPct,
      invoicedPct,
      paidPct,
    },
  };

  return NextResponse.json({ item });
}

// PATCH /api/purchase-orders/[id]
// Body: { action: "submit"|"approve"|"reject"|"order"|"send"|"acknowledge"|
//                "hold"|"release"|"close"|"revise"|"cancel"|"update", ...payload }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCUREMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { action } = body;

  let existing: any;
  try {
    existing = await db.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    });
  } catch (e: any) {
    console.error("PO lookup failed:", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

  const audit = (action: string, oldValues: any, newValues: any) =>
    auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action,
      resourceType: "purchase_order",
      resourceId: id,
      oldValues,
      newValues,
      reason: body.reason || body.rejectionReason || body.holdReason || body.closeNotes || body.cancelReason || undefined,
    });

  // ---- SUBMIT ----  draft → pending_approval
  if (action === "submit") {
    if (existing.status !== "draft") {
      return NextResponse.json({ error: "Only draft POs can be submitted" }, { status: 400 });
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: { status: "pending_approval", submittedAt: new Date() },
    });
    await audit("PURCHASE_ORDER_SUBMITTED", { status: existing.status }, { status: "pending_approval" });
    return NextResponse.json({ item: updated });
  }

  // ---- APPROVE ----  pending_approval → approved
  if (action === "approve") {
    if (!["pending_approval", "approved", "sent_to_supplier"].includes(existing.status)) {
      return NextResponse.json({ error: "Only POs pending approval can be approved" }, { status: 400 });
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedById: session.user.id,
      },
    });
    await audit("PURCHASE_ORDER_APPROVED", { status: existing.status }, { status: "approved" });
    return NextResponse.json({ item: updated });
  }

  // ---- REJECT ----  pending_approval → rejected (requires rejectionReason)
  if (action === "reject") {
    if (existing.status !== "pending_approval") {
      return NextResponse.json({ error: "Only POs pending approval can be rejected" }, { status: 400 });
    }
    const rejectionReason = (body.rejectionReason || "").trim();
    if (!rejectionReason) {
      return NextResponse.json({ error: "rejectionReason is required" }, { status: 400 });
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedById: session.user.id,
        rejectionReason,
      },
    });
    await audit("PURCHASE_ORDER_REJECTED", { status: existing.status }, { status: "rejected", rejectionReason });
    return NextResponse.json({ item: updated });
  }

  // ---- ORDER (legacy alias) ----  approved → sent_to_supplier
  if (action === "order") {
    if (existing.status !== "approved") {
      return NextResponse.json({ error: "Only approved POs can be ordered" }, { status: 400 });
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: {
        status: "sent_to_supplier",
        orderedAt: new Date(),
        sentToSupplierAt: new Date(),
        sentById: session.user.id,
      },
    });
    await audit("PURCHASE_ORDER_ORDERED", { status: existing.status }, { status: "sent_to_supplier" });
    return NextResponse.json({ item: updated });
  }

  // ---- SEND ----  approved → sent_to_supplier
  if (action === "send") {
    if (existing.status !== "approved") {
      return NextResponse.json({ error: "Only approved POs can be sent to supplier" }, { status: 400 });
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: {
        status: "sent_to_supplier",
        sentToSupplierAt: new Date(),
        sentById: session.user.id,
      },
    });
    await audit("PURCHASE_ORDER_SENT", { status: existing.status }, { status: "sent_to_supplier" });
    return NextResponse.json({ item: updated });
  }

  // ---- ACKNOWLEDGE ----  sent_to_supplier → acknowledged
  if (action === "acknowledge") {
    if (existing.status !== "sent_to_supplier") {
      return NextResponse.json({ error: "Only POs sent to supplier can be acknowledged" }, { status: 400 });
    }
    const ackStatus = body.supplierAckStatus || "accepted";
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: {
        status: "acknowledged",
        acknowledgedAt: new Date(),
        acknowledgedById: session.user.id,
        supplierAckStatus: ackStatus,
        supplierAckComments: body.supplierAckComments || null,
      },
    });
    await audit("PURCHASE_ORDER_ACKED", { status: existing.status }, { status: "acknowledged", supplierAckStatus: ackStatus });
    return NextResponse.json({ item: updated });
  }

  // ---- HOLD ----  any active status → on_hold (requires holdReason)
  if (action === "hold") {
    if (!ACTIVE_STATUSES.has(existing.status)) {
      return NextResponse.json({ error: "Only active POs can be put on hold" }, { status: 400 });
    }
    const holdReason = (body.holdReason || "").trim();
    if (!holdReason) {
      return NextResponse.json({ error: "holdReason is required" }, { status: 400 });
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: {
        status: "on_hold",
        previousStatus: existing.status,
        holdReason,
        heldAt: new Date(),
        heldById: session.user.id,
      },
    });
    await audit("PURCHASE_ORDER_HELD", { status: existing.status }, { status: "on_hold", holdReason });
    return NextResponse.json({ item: updated });
  }

  // ---- RELEASE ----  on_hold → previousStatus
  if (action === "release") {
    if (existing.status !== "on_hold") {
      return NextResponse.json({ error: "Only on-hold POs can be released" }, { status: 400 });
    }
    const target = existing.previousStatus || "approved";
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: {
        status: target,
        previousStatus: null,
        holdReason: null,
        heldAt: null,
        heldById: null,
      },
    });
    await audit("PURCHASE_ORDER_RELEASED", { status: existing.status }, { status: target });
    return NextResponse.json({ item: updated });
  }

  // ---- CLOSE ----  fully_paid or fully_received → closed (sets closedAt/closedById/closeNotes)
  if (action === "close") {
    if (!["fully_paid", "fully_received", "fully_invoiced"].includes(existing.status)) {
      return NextResponse.json({ error: "Only fully received/paid/invoiced POs can be closed" }, { status: 400 });
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: {
        status: "closed",
        closedAt: new Date(),
        closedById: session.user.id,
        closeNotes: body.closeNotes || null,
      },
    });
    await audit("PURCHASE_ORDER_CLOSED", { status: existing.status }, { status: "closed" });
    return NextResponse.json({ item: updated });
  }

  // ---- REVISE ----  approved+ → draft with revisionNumber++ (requires reason)
  if (action === "revise") {
    if (!["approved", "sent_to_supplier", "acknowledged", "pending_approval"].includes(existing.status)) {
      return NextResponse.json({ error: "Only approved/pending/sent POs can be revised" }, { status: 400 });
    }
    const reason = (body.reason || "").trim();
    if (!reason) {
      return NextResponse.json({ error: "reason is required to revise a PO" }, { status: 400 });
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: {
        status: "draft",
        revisionNumber: { increment: 1 },
        approvedAt: null,
        approvedById: null,
        submittedAt: null,
        sentToSupplierAt: null,
        sentById: null,
        acknowledgedAt: null,
        acknowledgedById: null,
        supplierAckStatus: null,
        supplierAckComments: null,
        notes: existing.notes ? `${existing.notes}\n[Revision #${(existing.revisionNumber || 0) + 1}: ${reason}]` : `[Revision #${(existing.revisionNumber || 0) + 1}: ${reason}]`,
      },
    });
    await audit("PURCHASE_ORDER_REVISED", { status: existing.status, revisionNumber: existing.revisionNumber }, { status: "draft", revisionNumber: (existing.revisionNumber || 0) + 1, reason });
    return NextResponse.json({ item: updated });
  }

  // ---- CANCEL ----  any non-received/cancelled → cancelled
  if (action === "cancel") {
    if (["fully_received", "closed", "cancelled"].includes(existing.status)) {
      return NextResponse.json({ error: "Cannot cancel a PO that is already received/closed/cancelled" }, { status: 400 });
    }
    const cancelReason = (body.cancelReason || "").trim();
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledById: session.user.id,
        cancelReason: cancelReason || null,
      },
    });
    await audit("PURCHASE_ORDER_CANCELLED", { status: existing.status }, { status: "cancelled", cancelReason });
    return NextResponse.json({ item: updated });
  }

  // ---- UPDATE (basic fields, only draft) ----
  if (action === "update") {
    if (existing.status !== "draft") {
      return NextResponse.json({ error: "Only draft POs can be edited" }, { status: 400 });
    }
    const data: any = {};
    const allowedFields = [
      "supplierId", "departmentId", "priority", "expectedDeliveryDate",
      "actualDeliveryDate", "currency", "paymentTerms", "deliveryTerms",
      "shippingAddress", "deliveryContact", "deliveryPhone", "shippingMethod",
      "supplierReference", "trackingNumber", "notes", "termsAndConditions",
      "isEmergency", "emergencyReason",
    ];
    for (const f of allowedFields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (data.expectedDeliveryDate) data.expectedDeliveryDate = new Date(data.expectedDeliveryDate);
    if (data.actualDeliveryDate) data.actualDeliveryDate = new Date(data.actualDeliveryDate);

    const updated = await db.purchaseOrder.update({ where: { id }, data });
    await audit("PURCHASE_ORDER_UPDATED", existing, data);
    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

// DELETE — only draft POs can be deleted
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCUREMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let existing: any;
  try {
    existing = await db.purchaseOrder.findUnique({ where: { id } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  if (existing.status !== "draft") {
    return NextResponse.json({ error: "Only draft POs can be deleted" }, { status: 400 });
  }

  try {
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    await db.purchaseOrder.delete({ where: { id } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "PURCHASE_ORDER_DELETED",
    resourceType: "purchase_order",
    resourceId: id,
    oldValues: { purchaseOrderNumber: existing.purchaseOrderNumber },
  });

  return NextResponse.json({ success: true });
}
