// =====================================================================
// API: /api/invoices/[id]
//   GET   — single invoice with items + payments
//   PATCH — action: "cancel" | "add_item" | "update"
//           cancel (requires billing.cancel, only if no payments): set status=cancelled
//           add_item (requires billing.create, only if status=issued): append InvoiceItem + recompute totals
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
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true, email: true, address: true } },
      facility: { select: { id: true, name: true, code: true } },
      encounter: { select: { id: true, encounterNumber: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      items: { include: { service: { select: { id: true, name: true, code: true, category: true } } }, orderBy: { createdAt: "asc" } },
      payments: {
        orderBy: { receivedAt: "desc" },
        include: {
          receivedBy: { select: { id: true, firstName: true, lastName: true } },
          refunds: true,
        },
      },
      refunds: { orderBy: { createdAt: "desc" } },
      insuranceClaims: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  return NextResponse.json({ item: invoice });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
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

  const existing = await db.invoice.findUnique({
    where: { id },
    include: { _count: { select: { payments: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  // ---- CANCEL ----
  if (action === "cancel") {
    if (!hasPermission(session, PERMISSIONS.BILLING_CANCEL)) {
      return NextResponse.json({ error: "Missing billing.cancel permission" }, { status: 403 });
    }
    if (existing._count.payments > 0) {
      return NextResponse.json({ error: "Cannot cancel an invoice that has payments recorded. Refund payments first." }, { status: 400 });
    }
    if (existing.status === "cancelled") {
      return NextResponse.json({ error: "Invoice is already cancelled" }, { status: 400 });
    }

    const updated = await db.invoice.update({
      where: { id },
      data: { status: "cancelled" },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "INVOICE_CANCELLED",
      resourceType: "invoice",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "cancelled" },
      reason: body.reason || null,
    });

    return NextResponse.json({ item: updated });
  }

  // ---- ADD ITEM ----
  if (action === "add_item") {
    if (!hasPermission(session, PERMISSIONS.BILLING_CREATE)) {
      return NextResponse.json({ error: "Missing billing.create permission" }, { status: 403 });
    }
    if (existing.status !== "issued") {
      return NextResponse.json({ error: `Cannot add items to an invoice with status: ${existing.status}` }, { status: 400 });
    }

    const { serviceId, description, quantity, unitPrice, discount, tax, referenceType, referenceId } = body;
    if (!description || quantity == null || unitPrice == null) {
      return NextResponse.json({ error: "description, quantity, unitPrice are required" }, { status: 400 });
    }

    try {
      const updated = await db.$transaction(async (tx) => {
        const qty = Number(quantity) || 1;
        const price = Number(unitPrice) || 0;
        const lineDiscount = Number(discount) || 0;
        const lineTax = Number(tax) || 0;
        const lineTotal = Math.max(0, qty * price - lineDiscount + lineTax);

        const item = await tx.invoiceItem.create({
          data: {
            invoiceId: id,
            serviceId: serviceId || null,
            description,
            quantity: qty,
            unitPrice: price,
            discount: lineDiscount,
            tax: lineTax,
            total: lineTotal,
            referenceType: referenceType || null,
            referenceId: referenceId || null,
          },
        });

        // Recompute invoice totals
        const items = await tx.invoiceItem.findMany({ where: { invoiceId: id } });
        const newSubtotal = items.reduce((s, it) => s + it.total, 0);
        const newTotal = Math.max(0, newSubtotal - existing.discount + existing.tax);
        const newBalance = Math.max(0, newTotal - existing.amountPaid);

        const newStatus = existing.amountPaid >= newTotal && newTotal > 0 ? "paid" : existing.amountPaid > 0 ? "partially_paid" : existing.status;

        const inv = await tx.invoice.update({
          where: { id },
          data: {
            subtotal: newSubtotal,
            total: newTotal,
            balance: newBalance,
            status: newStatus,
          },
        });

        return { inv, item };
      });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId,
        action: "INVOICE_ITEM_ADDED",
        resourceType: "invoice_item",
        resourceId: updated.item.id,
        newValues: {
          invoiceId: id, description, quantity, unitPrice, total: updated.inv.total,
        },
      });

      return NextResponse.json({ item: updated.inv, newItem: updated.item });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "Failed to add item" }, { status: 400 });
    }
  }

  // ---- UPDATE (e.g., dueAt, status override by accountant) ----
  if (!hasPermission(session, PERMISSIONS.BILLING_CREATE)) {
    return NextResponse.json({ error: "Missing billing.create permission" }, { status: 403 });
  }
  const data: any = {};
  if (body.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(body.dueAt) : null;
  if (body.discount !== undefined && hasPermission(session, PERMISSIONS.BILLING_DISCOUNT)) {
    const newDiscount = Number(body.discount) || 0;
    const newTotal = Math.max(0, existing.subtotal - newDiscount + existing.tax);
    data.discount = newDiscount;
    data.total = newTotal;
    data.balance = Math.max(0, newTotal - existing.amountPaid);
    data.status = existing.amountPaid >= newTotal && newTotal > 0 ? "paid" : existing.amountPaid > 0 ? "partially_paid" : existing.status;
  }

  const updated = await db.invoice.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "INVOICE_UPDATED",
    resourceType: "invoice",
    resourceId: id,
    oldValues: { discount: existing.discount, dueAt: existing.dueAt, status: existing.status },
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}
