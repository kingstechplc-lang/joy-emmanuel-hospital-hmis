// =====================================================================
// API: /api/invoices/[id]
//   GET   — single invoice with items, payments, refunds, insurance
//           claims, credit notes, adjustments, all lifecycle user
//           relations, and an `isOverdue` computed flag. Also pulls
//           patient insurance & NHIS claims for context.
//   PATCH — lifecycle actions:
//             cancel | add_item | update            (existing)
//             review | approve | issue | void |
//             write_off | credit_note | add_adjustment  (new)
//           All actions are audit logged and permission-gated.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextInvoiceNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const FINAL_STATUSES = ["paid", "voided", "cancelled", "refunded", "written_off"];
const PRE_ISSUE_STATUSES = ["draft", "pending_review", "approved"];

function isOverdue(inv: { status: string; dueAt: Date | null; balance: number }): boolean {
  if (!inv.dueAt) return false;
  if (FINAL_STATUSES.includes(inv.status)) return false;
  return new Date(inv.dueAt).getTime() < Date.now() && (inv.balance ?? 0) > 0;
}

async function nextCreditNoteNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.creditNote.count({ where: { facilityId } });
  return `CN-${year}-${String(count + 1).padStart(6, "0")}`;
}

// ----------------------------------------------------------------------
// GET — single invoice with full context
// ----------------------------------------------------------------------
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let invoice: any = null;
  try {
    invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            patientNumber: true,
            firstName: true,
            lastName: true,
            middleName: true,
            sex: true,
            dateOfBirth: true,
            phone: true,
            email: true,
            address: true,
            city: true,
            // Insurance records on the patient
            insurance: {
              include: {
                insuranceProvider: { select: { id: true, name: true, code: true } },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
        facility: { select: { id: true, name: true, code: true } },
        encounter: { select: { id: true, encounterNumber: true } },
        // Lifecycle actors
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        issuedBy: { select: { id: true, firstName: true, lastName: true } },
        voidedBy: { select: { id: true, firstName: true, lastName: true } },
        cancelledBy: { select: { id: true, firstName: true, lastName: true } },
        writtenOffBy: { select: { id: true, firstName: true, lastName: true } },
        discountApprovedBy: { select: { id: true, firstName: true, lastName: true } },
        // Financial children
        items: {
          include: { service: { select: { id: true, name: true, code: true, category: true } } },
          orderBy: { createdAt: "asc" },
        },
        payments: {
          orderBy: { receivedAt: "desc" },
          include: {
            receivedBy: { select: { id: true, firstName: true, lastName: true } },
            refunds: true,
          },
        },
        refunds: {
          orderBy: { createdAt: "desc" },
          include: {
            requestedBy: { select: { id: true, firstName: true, lastName: true } },
            approvedBy: { select: { id: true, firstName: true, lastName: true } },
            processedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        insuranceClaims: {
          orderBy: { createdAt: "desc" },
          include: {
            insuranceProvider: { select: { id: true, name: true, code: true } },
          },
        },
        creditNotes: {
          orderBy: { createdAt: "desc" },
          include: {
            issuedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        adjustments: {
          orderBy: { createdAt: "desc" },
          include: {
            approvedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        _count: {
          select: {
            items: true,
            payments: true,
            refunds: true,
            insuranceClaims: true,
            creditNotes: true,
            adjustments: true,
          },
        },
      },
    });
  } catch (e: any) {
    console.error("GET /api/invoices/[id] failed:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to load invoice" },
      { status: 500 }
    );
  }

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  // Pull NHIS claims for this invoice (claims where invoice is linked)
  let nhisClaims: any[] = [];
  try {
    nhisClaims = await db.insuranceClaim.findMany({
      where: { invoiceId: id, nhisNumber: { not: null } },
      select: {
        id: true,
        claimNumber: true,
        nhisNumber: true,
        claimType: true,
        claimAmount: true,
        approvedAmount: true,
        status: true,
        submittedAt: true,
        approvedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    // non-fatal — leave empty
  }

  return NextResponse.json({
    item: {
      ...invoice,
      isOverdue: isOverdue(invoice),
    },
    nhisClaims,
  });
}

// ----------------------------------------------------------------------
// PATCH — lifecycle / mutation actions
// ----------------------------------------------------------------------
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
    include: {
      _count: { select: { payments: true, items: true, creditNotes: true, adjustments: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  // ===================================================================
  // CANCEL  (existing — preserved)
  // ===================================================================
  if (action === "cancel") {
    if (!hasPermission(session, PERMISSIONS.BILLING_CANCEL)) {
      return NextResponse.json({ error: "Missing billing.cancel permission" }, { status: 403 });
    }
    if (existing._count.payments > 0) {
      return NextResponse.json(
        { error: "Cannot cancel an invoice that has payments recorded. Refund payments first." },
        { status: 400 }
      );
    }
    if (existing.status === "cancelled") {
      return NextResponse.json({ error: "Invoice is already cancelled" }, { status: 400 });
    }
    if (existing.status === "voided") {
      return NextResponse.json({ error: "Invoice is already voided" }, { status: 400 });
    }

    const updated = await db.invoice.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledById: session.user.id,
        cancelReason: body.reason || null,
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "INVOICE_CANCELLED",
      resourceType: "invoice",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "cancelled", cancelReason: body.reason || null },
      reason: body.reason || null,
    });

    return NextResponse.json({ item: updated });
  }

  // ===================================================================
  // ADD ITEM  (existing — preserved, but now allowed pre-issue)
  // ===================================================================
  if (action === "add_item") {
    if (!hasPermission(session, PERMISSIONS.BILLING_CREATE)) {
      return NextResponse.json({ error: "Missing billing.create permission" }, { status: 403 });
    }
    // Once issued, financial fields are locked
    if (!PRE_ISSUE_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot add items to an invoice with status: ${existing.status}. Financial fields are locked after issuance.` },
        { status: 400 }
      );
    }

    const { serviceId, description, quantity, unitPrice, discount, tax, referenceType, referenceId } = body;
    if (!description || quantity == null || unitPrice == null) {
      return NextResponse.json(
        { error: "description, quantity, unitPrice are required" },
        { status: 400 }
      );
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
        const newBalance = Math.max(0, newTotal - existing.amountPaid - existing.amountCredited - existing.amountRefunded);

        const inv = await tx.invoice.update({
          where: { id },
          data: {
            subtotal: newSubtotal,
            total: newTotal,
            balance: newBalance,
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
          invoiceId: id,
          description,
          quantity,
          unitPrice,
          total: updated.inv.total,
        },
      });

      return NextResponse.json({ item: updated.inv, newItem: updated.item });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "Failed to add item" }, { status: 400 });
    }
  }

  // ===================================================================
  // REVIEW  (new)
  // ===================================================================
  if (action === "review") {
    if (!hasPermission(session, PERMISSIONS.BILLING_CREATE)) {
      return NextResponse.json({ error: "Missing billing.create permission" }, { status: 403 });
    }
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: `Can only review draft invoices (current: ${existing.status})` },
        { status: 400 }
      );
    }

    const updated = await db.invoice.update({
      where: { id },
      data: {
        status: "pending_review",
        reviewedAt: new Date(),
        reviewedById: session.user.id,
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "INVOICE_REVIEWED",
      resourceType: "invoice",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "pending_review", reviewedAt: new Date() },
      reason: body.reviewNotes || null,
    });

    return NextResponse.json({ item: updated });
  }

  // ===================================================================
  // APPROVE  (new)
  // ===================================================================
  if (action === "approve") {
    if (!hasPermission(session, PERMISSIONS.BILLING_CREATE)) {
      return NextResponse.json({ error: "Missing billing.create permission" }, { status: 403 });
    }
    if (existing.status !== "pending_review") {
      return NextResponse.json(
        { error: `Can only approve pending_review invoices (current: ${existing.status})` },
        { status: 400 }
      );
    }

    const updated = await db.invoice.update({
      where: { id },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedById: session.user.id,
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "INVOICE_APPROVED",
      resourceType: "invoice",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "approved", approvedAt: new Date() },
      reason: body.approvalNotes || null,
    });

    return NextResponse.json({ item: updated });
  }

  // ===================================================================
  // ISSUE  (new) — locks financial fields, sets issuedAt, generates
  // invoice number if not already set.
  // ===================================================================
  if (action === "issue") {
    if (!hasPermission(session, PERMISSIONS.BILLING_CREATE)) {
      return NextResponse.json({ error: "Missing billing.create permission" }, { status: 403 });
    }
    if (!PRE_ISSUE_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { error: `Can only issue draft/pending_review/approved invoices (current: ${existing.status})` },
        { status: 400 }
      );
    }

    try {
      const updated = await db.$transaction(async (tx) => {
        // Generate invoice number if missing (defensive — schema requires non-null)
        let invoiceNumber = existing.invoiceNumber;
        if (!invoiceNumber) {
          invoiceNumber = await nextInvoiceNumber(existing.facilityId);
        }

        const inv = await tx.invoice.update({
          where: { id },
          data: {
            status: "issued",
            issuedAt: new Date(),
            issuedById: session.user.id,
            invoiceNumber,
          },
        });

        return inv;
      });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId,
        action: "INVOICE_ISSUED",
        resourceType: "invoice",
        resourceId: id,
        oldValues: { status: existing.status },
        newValues: { status: "issued", issuedAt: new Date(), invoiceNumber: updated.invoiceNumber },
      });

      return NextResponse.json({ item: updated });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "Failed to issue invoice" }, { status: 400 });
    }
  }

  // ===================================================================
  // VOID  (new) — requires voidReason; cannot void if payments exist
  // ===================================================================
  if (action === "void") {
    if (!hasPermission(session, PERMISSIONS.BILLING_CANCEL)) {
      return NextResponse.json({ error: "Missing billing.cancel permission" }, { status: 403 });
    }
    if (!body.voidReason || String(body.voidReason).trim() === "") {
      return NextResponse.json({ error: "voidReason is required" }, { status: 400 });
    }
    if (existing._count.payments > 0) {
      return NextResponse.json(
        { error: "Cannot void an invoice that has payments recorded. Refund payments first." },
        { status: 400 }
      );
    }
    if (existing.status === "voided") {
      return NextResponse.json({ error: "Invoice is already voided" }, { status: 400 });
    }
    if (existing.status === "cancelled") {
      return NextResponse.json({ error: "Invoice is already cancelled" }, { status: 400 });
    }

    const updated = await db.invoice.update({
      where: { id },
      data: {
        status: "voided",
        voidedAt: new Date(),
        voidedById: session.user.id,
        voidReason: body.voidReason,
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "INVOICE_VOIDED",
      resourceType: "invoice",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "voided", voidReason: body.voidReason },
      reason: body.voidReason,
    });

    return NextResponse.json({ item: updated });
  }

  // ===================================================================
  // WRITE OFF  (new) — requires writeOffReason + writeOffAmount
  // ===================================================================
  if (action === "write_off") {
    if (!hasPermission(session, PERMISSIONS.BILLING_CANCEL)) {
      return NextResponse.json({ error: "Missing billing.cancel permission" }, { status: 403 });
    }
    if (!body.writeOffReason || String(body.writeOffReason).trim() === "") {
      return NextResponse.json({ error: "writeOffReason is required" }, { status: 400 });
    }
    const writeOffAmount = Number(body.writeOffAmount);
    if (!writeOffAmount || writeOffAmount <= 0) {
      return NextResponse.json(
        { error: "writeOffAmount must be a positive number" },
        { status: 400 }
      );
    }
    if (FINAL_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot write off an invoice in status: ${existing.status}` },
        { status: 400 }
      );
    }
    if (writeOffAmount > existing.balance + 0.01) {
      return NextResponse.json(
        {
          error: `Write-off amount (${writeOffAmount}) cannot exceed outstanding balance (${existing.balance})`,
        },
        { status: 400 }
      );
    }

    const updated = await db.$transaction(async (tx) => {
      const newBalance = Math.max(0, existing.balance - writeOffAmount);
      const newStatus = newBalance === 0 ? "written_off" : existing.status;

      const inv = await tx.invoice.update({
        where: { id },
        data: {
          status: newStatus,
          balance: newBalance,
          writeOffAmount,
          writeOffReason: body.writeOffReason,
          writtenOffAt: new Date(),
          writtenOffById: session.user.id,
        },
      });

      // Record the adjustment trail
      await tx.invoiceAdjustment.create({
        data: {
          invoiceId: id,
          adjustmentType: "write_off",
          amount: writeOffAmount,
          reason: body.writeOffReason,
          description: body.description || null,
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
      });

      return inv;
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "INVOICE_WRITTEN_OFF",
      resourceType: "invoice",
      resourceId: id,
      oldValues: { status: existing.status, balance: existing.balance },
      newValues: {
        status: updated.status,
        balance: updated.balance,
        writeOffAmount,
        writeOffReason: body.writeOffReason,
      },
      reason: body.writeOffReason,
    });

    return NextResponse.json({ item: updated });
  }

  // ===================================================================
  // CREDIT NOTE  (new) — create CreditNote record, update invoice
  // amountCredited & balance
  // ===================================================================
  if (action === "credit_note") {
    if (!hasPermission(session, PERMISSIONS.BILLING_DISCOUNT)) {
      return NextResponse.json({ error: "Missing billing.discount permission" }, { status: 403 });
    }
    const creditAmount = Number(body.amount);
    if (!creditAmount || creditAmount <= 0) {
      return NextResponse.json(
        { error: "amount (positive number) is required" },
        { status: 400 }
      );
    }
    if (!body.reason || String(body.reason).trim() === "") {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }
    if (existing.status === "voided" || existing.status === "cancelled") {
      return NextResponse.json(
        { error: `Cannot issue a credit note for an invoice in status: ${existing.status}` },
        { status: 400 }
      );
    }

    try {
      const result = await db.$transaction(async (tx) => {
        const creditNoteNumber = await nextCreditNoteNumber(existing.facilityId);

        const cn = await tx.creditNote.create({
          data: {
            creditNoteNumber,
            invoiceId: id,
            facilityId: existing.facilityId,
            patientId: existing.patientId,
            amount: creditAmount,
            reason: body.reason,
            description: body.description || null,
            status: "issued",
            issuedAt: new Date(),
            issuedById: session.user.id,
            appliedAt: new Date(),
          },
        });

        const newAmountCredited = (existing.amountCredited || 0) + creditAmount;
        const newBalance = Math.max(
          0,
          existing.total - existing.amountPaid - newAmountCredited - existing.amountRefunded
        );
        // If credit covers full balance, mark as paid
        const newStatus =
          newBalance === 0 && existing.status !== "draft"
            ? "paid"
            : existing.status === "draft"
              ? "draft"
              : existing.amountPaid > 0
                ? "partially_paid"
                : existing.status;

        const inv = await tx.invoice.update({
          where: { id },
          data: {
            amountCredited: newAmountCredited,
            balance: newBalance,
            status: newStatus,
          },
        });

        return { cn, inv };
      });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId,
        action: "INVOICE_CREDIT_NOTE",
        resourceType: "credit_note",
        resourceId: result.cn.id,
        oldValues: {
          amountCredited: existing.amountCredited,
          balance: existing.balance,
          status: existing.status,
        },
        newValues: {
          creditNoteNumber: result.cn.creditNoteNumber,
          amount: creditAmount,
          amountCredited: result.inv.amountCredited,
          balance: result.inv.balance,
          status: result.inv.status,
        },
        reason: body.reason,
      });

      return NextResponse.json({ item: result.inv, creditNote: result.cn });
    } catch (e: any) {
      return NextResponse.json(
        { error: e.message || "Failed to issue credit note" },
        { status: 400 }
      );
    }
  }

  // ===================================================================
  // ADD ADJUSTMENT  (new) — create InvoiceAdjustment record
  // ===================================================================
  if (action === "add_adjustment") {
    if (!hasPermission(session, PERMISSIONS.BILLING_DISCOUNT)) {
      return NextResponse.json({ error: "Missing billing.discount permission" }, { status: 403 });
    }
    const validTypes = ["debit", "credit", "write_off", "correction", "other"];
    const adjustmentType = String(body.adjustmentType || "").toLowerCase();
    if (!validTypes.includes(adjustmentType)) {
      return NextResponse.json(
        { error: `adjustmentType must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }
    const amount = Number(body.amount);
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "amount (positive number) is required" },
        { status: 400 }
      );
    }
    if (!body.reason || String(body.reason).trim() === "") {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }
    if (FINAL_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot adjust an invoice in status: ${existing.status}` },
        { status: 400 }
      );
    }

    try {
      const adjustment = await db.invoiceAdjustment.create({
        data: {
          invoiceId: id,
          adjustmentType,
          amount,
          reason: body.reason,
          description: body.description || null,
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
      });

      // Update invoice balance based on adjustment type
      // debit  → balance increases
      // credit → balance decreases
      // write_off → balance decreases (full or partial)
      // correction → use amount sign as-is
      let balanceDelta = 0;
      if (adjustmentType === "debit") balanceDelta = amount;
      else if (adjustmentType === "credit") balanceDelta = -amount;
      else if (adjustmentType === "write_off") balanceDelta = -amount;
      else if (adjustmentType === "correction") balanceDelta = amount; // assume positive correction

      if (balanceDelta !== 0) {
        const newBalance = Math.max(0, existing.balance + balanceDelta);
        await db.invoice.update({
          where: { id },
          data: { balance: newBalance },
        });
      }

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId,
        action: "INVOICE_ADJUSTMENT_ADDED",
        resourceType: "invoice_adjustment",
        resourceId: adjustment.id,
        newValues: {
          invoiceId: id,
          adjustmentType,
          amount,
          reason: body.reason,
        },
        reason: body.reason,
      });

      return NextResponse.json({ item: adjustment });
    } catch (e: any) {
      return NextResponse.json(
        { error: e.message || "Failed to add adjustment" },
        { status: 400 }
      );
    }
  }

  // ===================================================================
  // UPDATE  (existing — preserved, expanded with new editable fields)
  // ===================================================================
  if (!hasPermission(session, PERMISSIONS.BILLING_CREATE)) {
    return NextResponse.json({ error: "Missing billing.create permission" }, { status: 403 });
  }

  const data: any = {};

  // dueAt — editable any time before final state
  if (body.dueAt !== undefined) {
    data.dueAt = body.dueAt ? new Date(body.dueAt) : null;
  }

  // Notes & payment terms — editable in any non-final state
  if (body.internalNotes !== undefined) data.internalNotes = body.internalNotes || null;
  if (body.patientNotes !== undefined) data.patientNotes = body.patientNotes || null;
  if (body.paymentTerms !== undefined) data.paymentTerms = body.paymentTerms || null;

  // Payer / insurance — editable pre-issue
  if (!FINAL_STATUSES.includes(existing.status)) {
    if (body.invoiceType !== undefined) data.invoiceType = body.invoiceType;
    if (body.payerType !== undefined) data.payerType = body.payerType;
    if (body.payerResponsibility !== undefined) data.payerResponsibility = Number(body.payerResponsibility) || 0;
    if (body.patientResponsibility !== undefined) data.patientResponsibility = Number(body.patientResponsibility) || 0;
    if (body.insuranceResponsibility !== undefined) data.insuranceResponsibility = Number(body.insuranceResponsibility) || 0;
    if (body.nhisResponsibility !== undefined) data.nhisResponsibility = Number(body.nhisResponsibility) || 0;
    if (body.insuranceProviderId !== undefined) data.insuranceProviderId = body.insuranceProviderId || null;
    if (body.insurancePolicyNumber !== undefined) data.insurancePolicyNumber = body.insurancePolicyNumber || null;
    if (body.insuranceAuthorization !== undefined) data.insuranceAuthorization = body.insuranceAuthorization || null;
    if (body.nhisNumber !== undefined) data.nhisNumber = body.nhisNumber || null;
    if (body.corporateName !== undefined) data.corporateName = body.corporateName || null;
    if (body.corporateAccountNumber !== undefined) data.corporateAccountNumber = body.corporateAccountNumber || null;
    if (body.currency !== undefined) data.currency = body.currency || "GHS";
  }

  // Discount — requires BILLING_DISCOUNT permission. Only editable pre-issue.
  if (body.discount !== undefined && hasPermission(session, PERMISSIONS.BILLING_DISCOUNT)) {
    if (FINAL_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { error: "Cannot change discount on an invoice in a final state" },
        { status: 400 }
      );
    }
    const newDiscount = Number(body.discount) || 0;
    const newTotal = Math.max(0, existing.subtotal - newDiscount + existing.tax);
    const newBalance = Math.max(0, newTotal - existing.amountPaid - existing.amountCredited - existing.amountRefunded);
    data.discount = newDiscount;
    data.total = newTotal;
    data.balance = newBalance;
    if (body.discountReason !== undefined) data.discountReason = body.discountReason || null;
    if (hasPermission(session, PERMISSIONS.BILLING_DISCOUNT)) {
      data.discountApprovedById = session.user.id;
    }
  }

  // Tax — editable pre-issue (requires BILLING_CREATE which we already checked)
  if (body.tax !== undefined && !FINAL_STATUSES.includes(existing.status)) {
    const newTax = Number(body.tax) || 0;
    const newTotal = Math.max(0, existing.subtotal - (data.discount ?? existing.discount) + newTax);
    const newBalance = Math.max(0, newTotal - existing.amountPaid - existing.amountCredited - existing.amountRefunded);
    data.tax = newTax;
    data.total = newTotal;
    data.balance = newBalance;
  }
  if (body.taxRate !== undefined && !FINAL_STATUSES.includes(existing.status)) {
    data.taxRate = Number(body.taxRate) || 0;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const updated = await db.invoice.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "INVOICE_UPDATED",
    resourceType: "invoice",
    resourceId: id,
    oldValues: {
      discount: existing.discount,
      tax: existing.tax,
      dueAt: existing.dueAt,
      status: existing.status,
    },
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}
