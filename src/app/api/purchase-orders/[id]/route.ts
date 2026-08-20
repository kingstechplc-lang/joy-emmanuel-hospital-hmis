// =====================================================================
// API: /api/purchase-orders/[id]
//   GET, PATCH (status transitions: submit, approve, order, cancel), DELETE
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      facility: { select: { id: true, name: true, code: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      items: {
        include: {
          inventoryItem: true,
        },
      },
      goodsReceived: {
        orderBy: { receivedAt: "desc" },
        include: { facility: { select: { name: true } } },
      },
    },
  });

  if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

  return NextResponse.json({ item: po });
}

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
  const { action } = body; // submit | approve | order | cancel | update

  const existing = await db.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!existing) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

  // ---- SUBMIT ----
  if (action === "submit") {
    if (existing.status !== "draft") {
      return NextResponse.json({ error: "Only draft POs can be submitted" }, { status: 400 });
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: { status: "submitted" },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "PURCHASE_ORDER_SUBMITTED",
      resourceType: "purchase_order",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "submitted" },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- APPROVE ----
  if (action === "approve") {
    if (!["submitted", "ordered"].includes(existing.status)) {
      return NextResponse.json({ error: "Only submitted POs can be approved" }, { status: 400 });
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: { status: "approved" },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "PURCHASE_ORDER_APPROVED",
      resourceType: "purchase_order",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "approved" },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- ORDER ----
  if (action === "order") {
    if (existing.status !== "approved") {
      return NextResponse.json({ error: "Only approved POs can be ordered" }, { status: 400 });
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: { status: "ordered", orderedAt: new Date() },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "PURCHASE_ORDER_ORDERED",
      resourceType: "purchase_order",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "ordered" },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- CANCEL ----
  if (action === "cancel") {
    if (["received", "partially_received", "cancelled"].includes(existing.status)) {
      return NextResponse.json({ error: "Cannot cancel a PO that is already received or cancelled" }, { status: 400 });
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: { status: "cancelled" },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "PURCHASE_ORDER_CANCELLED",
      resourceType: "purchase_order",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "cancelled" },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- UPDATE (basic fields) ----
  if (action === "update") {
    if (!["draft", "submitted"].includes(existing.status)) {
      return NextResponse.json({ error: "Only draft/submitted POs can be edited" }, { status: 400 });
    }
    const data: any = {};
    if (body.supplierId !== undefined) data.supplierId = body.supplierId;
    if (body.status !== undefined) data.status = body.status;
    const updated = await db.purchaseOrder.update({ where: { id }, data });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "PURCHASE_ORDER_UPDATED",
      resourceType: "purchase_order",
      resourceId: id,
      oldValues: existing,
      newValues: data,
    });
    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCUREMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.purchaseOrder.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  if (existing.status !== "draft") {
    return NextResponse.json({ error: "Only draft POs can be deleted" }, { status: 400 });
  }

  await db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
  await db.purchaseOrder.delete({ where: { id } });

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
