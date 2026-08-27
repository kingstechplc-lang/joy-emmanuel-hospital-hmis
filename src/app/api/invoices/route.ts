// =====================================================================
// API: /api/invoices
//   GET  — list invoices with filters: facilityId, status, patientId,
//          invoiceType, payerType, from, to, q (search invoice number,
//          patient name, patient number). Includes all lifecycle
//          relations and an `isOverdue` computed flag.
//   POST — create invoice with items; auto-calc subtotal/discount/tax/
//          total; auto-generate invoice_number; status defaults to
//          "draft" (lifecycle: draft → pending_review → approved →
//          issued → partially_paid → paid / overdue / voided / written_off
//          / cancelled / refunded).
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextInvoiceNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const FINAL_STATUSES = ["paid", "voided", "cancelled", "refunded", "written_off"];

function isOverdue(inv: { status: string; dueAt: Date | null; balance: number }): boolean {
  if (!inv.dueAt) return false;
  if (FINAL_STATUSES.includes(inv.status)) return false;
  return new Date(inv.dueAt).getTime() < Date.now() && (inv.balance ?? 0) > 0;
}

// GET /api/invoices?facilityId=...&status=...&patientId=...
//                &invoiceType=...&payerType=...&from=YYYY-MM-DD&to=YYYY-MM-DD
//                &q=...&limit=100
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
  const invoiceType = url.searchParams.get("invoiceType");
  const payerType = url.searchParams.get("payerType");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (patientId) where.patientId = patientId;
  if (invoiceType) where.invoiceType = invoiceType;
  if (payerType) where.payerType = payerType;

  // Date range filter — prefer issuedAt, fall back to createdAt when null
  if (from || to) {
    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(`${from}T00:00:00`);
    if (to) dateFilter.lte = new Date(`${to}T23:59:59.999`);
    where.OR = [{ issuedAt: dateFilter }, { issuedAt: null, createdAt: dateFilter }];
  }

  // Search query — match invoice number OR patient name OR patient number
  if (q) {
    where.OR = [
      ...(where.OR || []),
      { invoiceNumber: { contains: q, mode: "insensitive" } },
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

  let invoices: any[] = [];
  try {
    invoices = await db.invoice.findMany({
      where,
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        patient: {
          select: {
            id: true,
            patientNumber: true,
            firstName: true,
            lastName: true,
            sex: true,
            phone: true,
          },
        },
        facility: { select: { id: true, name: true, code: true } },
        encounter: { select: { id: true, encounterNumber: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        issuedBy: { select: { id: true, firstName: true, lastName: true } },
        voidedBy: { select: { id: true, firstName: true, lastName: true } },
        cancelledBy: { select: { id: true, firstName: true, lastName: true } },
        creditNotes: { select: { id: true, creditNoteNumber: true, amount: true, status: true }, take: 5 },
        adjustments: {
          select: { id: true, adjustmentType: true, amount: true, reason: true },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        _count: { select: { items: true, payments: true, creditNotes: true, adjustments: true } },
      },
    });
  } catch (e: any) {
    // Resilient fallback — return empty list rather than 500
    console.error("GET /api/invoices failed:", e);
    return NextResponse.json({
      items: [],
      count: 0,
      error: "Failed to load invoices",
    });
  }

  // Decorate with computed isOverdue flag
  const items = invoices.map((inv) => ({
    ...inv,
    isOverdue: isOverdue(inv),
  }));

  return NextResponse.json({ items, count: items.length });
}

// POST /api/invoices
// body: {
//   patientId, encounterId?, admissionId?, facilityId,
//   invoiceType?, payerType?,
//   payerResponsibility?, patientResponsibility?,
//   insuranceResponsibility?, nhisResponsibility?,
//   insuranceProviderId?, insurancePolicyNumber?,
//   insuranceAuthorization?, nhisNumber?,
//   corporateName?, corporateAccountNumber?,
//   currency?, dueAt?, discount?, discountReason?, tax?, taxRate?,
//   internalNotes?, patientNotes?, paymentTerms?,
//   items: [{ serviceId?, description, quantity, unitPrice, discount?, tax?,
//            referenceType?, referenceId? }]
// }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_CREATE)) {
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
    patientId,
    encounterId,
    admissionId,
    facilityId,
    dueAt,
    discount,
    discountReason,
    tax,
    taxRate,
    currency,
    items,
    // New lifecycle / payer fields
    invoiceType,
    payerType,
    payerResponsibility,
    patientResponsibility,
    insuranceResponsibility,
    nhisResponsibility,
    insuranceProviderId,
    insurancePolicyNumber,
    insuranceAuthorization,
    nhisNumber,
    corporateName,
    corporateAccountNumber,
    internalNotes,
    patientNotes,
    paymentTerms,
  } = body;

  if (!patientId || !facilityId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "patientId, facilityId and at least one item are required" },
      { status: 400 }
    );
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
      // Recompute subtotal after price lookups
      const finalSubtotal = lineItems.reduce((s, li) => s + li.total, 0);
      const finalTotal = Math.max(0, finalSubtotal - headerDiscount + headerTax);

      const inv = await tx.invoice.create({
        data: {
          patientId,
          encounterId: encounterId || null,
          admissionId: admissionId || null,
          facilityId,
          invoiceNumber,
          // Lifecycle — start as draft. Issue action will move to "issued"
          // and stamp issuedAt / issuedById.
          status: "draft",
          // Payer / type
          invoiceType: invoiceType || "patient",
          payerType: payerType || "self_pay",
          // Financial fields
          subtotal: finalSubtotal,
          discount: headerDiscount,
          discountReason: discountReason || null,
          tax: headerTax,
          taxRate: Number(taxRate) || 0,
          total: finalTotal,
          amountPaid: 0,
          amountRefunded: 0,
          amountCredited: 0,
          balance: finalTotal,
          // Payer responsibility
          payerResponsibility: Number(payerResponsibility) || 0,
          patientResponsibility: Number(patientResponsibility) || 0,
          insuranceResponsibility: Number(insuranceResponsibility) || 0,
          nhisResponsibility: Number(nhisResponsibility) || 0,
          // Insurance / NHIS
          insuranceProviderId: insuranceProviderId || null,
          insurancePolicyNumber: insurancePolicyNumber || null,
          insuranceAuthorization: insuranceAuthorization || null,
          nhisNumber: nhisNumber || null,
          // Corporate
          corporateName: corporateName || null,
          corporateAccountNumber: corporateAccountNumber || null,
          // Currency
          currency: currency || "GHS",
          // Lifecycle timestamps — issuedAt is set when invoice is "issued"
          dueAt: dueAt ? new Date(dueAt) : null,
          // Notes
          internalNotes: internalNotes || null,
          patientNotes: patientNotes || null,
          paymentTerms: paymentTerms || null,
          // Audit
          createdById: session.user.id,
          items: { create: lineItems },
        },
        include: {
          patient: {
            select: { id: true, patientNumber: true, firstName: true, lastName: true },
          },
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
        invoiceType: invoice.invoiceType,
        payerType: invoice.payerType,
        subtotal: invoice.subtotal,
        discount: invoice.discount,
        tax: invoice.tax,
        total: invoice.total,
        itemCount: items.length,
        status: "draft",
      },
    });

    return NextResponse.json({ item: invoice }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create invoice" }, { status: 400 });
  }
}
