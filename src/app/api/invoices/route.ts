// =====================================================================
// API: /api/invoices
//   GET  — list invoices (filter by facility, status, patient)
//   POST — create invoice with items; auto-calc subtotal/discount/tax/total;
//          auto-generate invoice_number; status="issued" after creation.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextInvoiceNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

// GET /api/invoices?facilityId=...&status=...&patientId=...&limit=50
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (patientId) where.patientId = patientId;

  const invoices = await db.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, phone: true } },
      facility: { select: { id: true, name: true, code: true } },
      encounter: { select: { id: true, encounterNumber: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { items: true, payments: true } },
    },
  });

  return NextResponse.json({ items: invoices, count: invoices.length });
}

// POST /api/invoices
// body: { patientId, encounterId?, facilityId, dueAt?, discount?, tax?, currency?,
//         items: [{ serviceId?, description, quantity, unitPrice, discount?, tax?, referenceType?, referenceId? }] }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { patientId, encounterId, facilityId, dueAt, discount, tax, currency, items } = body;

  if (!patientId || !facilityId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "patientId, facilityId and at least one item are required" }, { status: 400 });
  }

  try {
    const invoiceNumber = await nextInvoiceNumber(facilityId);

    // Compute line totals + subtotal
    let subtotal = 0;
    const lineItems = items.map((it: any) => {
      const qty = Number(it.quantity) || 1;
      const price = Number(it.unitPrice) || 0;
      const lineDiscount = Number(it.discount) || 0;
      const lineTax = Number(it.tax) || 0;
      const lineTotal = Math.max(0, qty * price - lineDiscount + lineTax);
      subtotal += lineTotal;
      return {
        serviceId: it.serviceId || null,
        description: it.description || "Service",
        quantity: qty,
        unitPrice: price,
        discount: lineDiscount,
        tax: lineTax,
        total: lineTotal,
        referenceType: it.referenceType || null,
        referenceId: it.referenceId || null,
      };
    });

    const headerDiscount = Number(discount) || 0;
    const headerTax = Number(tax) || 0;
    const total = Math.max(0, subtotal - headerDiscount + headerTax);

    const invoice = await db.$transaction(async (tx) => {
      // Look up facility prices for any items that have a serviceId but no explicit unitPrice
      for (let i = 0; i < lineItems.length; i++) {
        const li = lineItems[i];
        if (li.serviceId && li.unitPrice === 0) {
          const fp = await tx.facilityServicePrice.findFirst({
            where: { facilityId, serviceId: li.serviceId, status: "active" },
          });
          if (fp) {
            li.unitPrice = fp.price;
            li.total = Math.max(0, li.quantity * li.unitPrice - li.discount + li.tax);
          } else {
            const svc = await tx.service.findUnique({ where: { id: li.serviceId } });
            if (svc) {
              li.unitPrice = svc.defaultPrice;
              li.total = Math.max(0, li.quantity * li.unitPrice - li.discount + li.tax);
            }
          }
        }
      }
      // Recompute subtotal
      const finalSubtotal = lineItems.reduce((s, li) => s + li.total, 0);
      const finalTotal = Math.max(0, finalSubtotal - headerDiscount + headerTax);

      const inv = await tx.invoice.create({
        data: {
          patientId,
          encounterId: encounterId || null,
          facilityId,
          invoiceNumber,
          status: "issued",
          subtotal: finalSubtotal,
          discount: headerDiscount,
          tax: headerTax,
          total: finalTotal,
          amountPaid: 0,
          balance: finalTotal,
          currency: currency || "GHS",
          issuedAt: new Date(),
          dueAt: dueAt ? new Date(dueAt) : null,
          createdById: session.user.id,
          items: { create: lineItems },
        },
        include: {
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
          facility: { select: { id: true, name: true } },
          items: { include: { service: { select: { id: true, name: true, code: true } } } },
        },
      });

      return inv;
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId,
      action: "INVOICE_CREATED",
      resourceType: "invoice",
      resourceId: invoice.id,
      newValues: {
        invoiceNumber,
        patientId,
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        tax: invoice.tax,
        total: invoice.total,
        itemCount: items.length,
      },
    });

    return NextResponse.json({ item: invoice }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create invoice" }, { status: 400 });
  }
}
