// =====================================================================
// API: /api/payments/[id]
//   GET   — single payment with relations (patient, facility, invoice,
//            receivedBy, refunds)
//   PATCH — action-based mutations:
//            • action="reverse"     — reverse a completed payment
//              (requires `reason`). Sets payment.status = "reversed",
//              reverts the invoice balance back (amountPaid -= amount,
//              balance += amount, status recomputed), and writes an
//              audit log. Gated by PERMISSIONS.BILLING_REFUND.
//            • action="add_refund"  — create a Refund request linked to
//              this payment. Validates payment is in a refundable state
//              and the requested amount does not exceed (payment.amount
//              - sum of existing non-rejected refunds). Gated by
//              PERMISSIONS.BILLING_REFUND.
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
  const payment = await db.payment.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, phone: true } },
      facility: { select: { id: true, name: true, code: true } },
      invoice: {
        select: {
          id: true, invoiceNumber: true, total: true, balance: true, amountPaid: true, status: true,
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
        },
      },
      receivedBy: { select: { id: true, firstName: true, lastName: true } },
      refunds: {
        orderBy: { createdAt: "desc" },
        include: {
          processedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  return NextResponse.json({ item: payment });
}

// PATCH /api/payments/[id]
// body: { action: "reverse" | "add_refund", reason?, amount?, refundMethod? }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_REFUND)) {
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
  const { action, reason, amount, refundMethod } = body;

  const existing = await db.payment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  // -----------------------------------------------------------------
  // REVERSE — invalidate a completed payment and roll back the invoice
  // -----------------------------------------------------------------
  if (action === "reverse") {
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: "A reason is required to reverse a payment." }, { status: 400 });
    }
    if (existing.status !== "completed") {
      return NextResponse.json({ error: `Cannot reverse payment with status: ${existing.status}. Only completed payments can be reversed.` }, { status: 400 });
    }

    try {
      const result = await db.$transaction(async (tx) => {
        // Lock the invoice
        const invoice = await tx.invoice.findUnique({ where: { id: existing.invoiceId } });
        if (!invoice) throw new Error("Linked invoice not found");

        // Mark payment as reversed (preserve audit trail — we don't delete it)
        const updatedPayment = await tx.payment.update({
          where: { id },
          data: { status: "reversed" },
        });

        // Roll back the invoice: subtract the reversed amount from
        // amountPaid, add it back to balance, recompute status.
        const newAmountPaid = Math.max(0, invoice.amountPaid - existing.amount);
        const newBalance = Math.max(0, invoice.total - newAmountPaid);
        let newStatus = invoice.status;
        if (newAmountPaid <= 0.001) {
          newStatus = ["paid", "partially_paid"].includes(invoice.status) ? "issued" : invoice.status;
        } else if (newBalance > 0.001) {
          newStatus = "partially_paid";
        } else {
          newStatus = "paid";
        }

        const updatedInvoice = await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid: newAmountPaid,
            balance: newBalance,
            status: newStatus,
          },
        });

        return { updatedPayment, updatedInvoice };
      });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId,
        action: "PAYMENT_REVERSED",
        resourceType: "payment",
        resourceId: id,
        oldValues: {
          status: existing.status,
          amount: existing.amount,
          paymentMethod: existing.paymentMethod,
        },
        newValues: {
          status: "reversed",
          reason,
          invoiceNewStatus: result.updatedInvoice.status,
          invoiceNewBalance: result.updatedInvoice.balance,
          invoiceNewAmountPaid: result.updatedInvoice.amountPaid,
        },
        reason,
      });

      return NextResponse.json({ item: result.updatedPayment, invoice: result.updatedInvoice });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "Failed to reverse payment" }, { status: 400 });
    }
  }

  // -----------------------------------------------------------------
  // ADD_REFUND — create a Refund request linked to this payment
  // -----------------------------------------------------------------
  if (action === "add_refund") {
    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "A positive refund amount is required." }, { status: 400 });
    }
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: "A reason is required for the refund request." }, { status: 400 });
    }
    if (existing.status !== "completed") {
      return NextResponse.json({ error: `Cannot request a refund on a payment with status: ${existing.status}.` }, { status: 400 });
    }

    const refundAmt = Number(amount);
    if (refundAmt > existing.amount) {
      return NextResponse.json({ error: `Refund amount cannot exceed payment amount of ${existing.amount}.` }, { status: 400 });
    }

    // Check for existing non-rejected refunds that would exceed the payment amount
    const existingRefunds = await db.refund.aggregate({
      where: { paymentId: id, status: { in: ["pending", "approved", "processed"] } },
      _sum: { amount: true },
    });
    const alreadyRefunded = existingRefunds._sum.amount || 0;
    if (alreadyRefunded + refundAmt > existing.amount) {
      return NextResponse.json({
        error: `Total refunds would exceed payment amount. Payment: ${existing.amount}, already requested: ${alreadyRefunded}, requested: ${refundAmt}`,
      }, { status: 400 });
    }

    try {
      const refund = await db.refund.create({
        data: {
          paymentId: id,
          invoiceId: existing.invoiceId,
          amount: refundAmt,
          reason,
          refundMethod: refundMethod || existing.paymentMethod,
          requestedById: session.user.id,
          status: "pending",
        },
        include: {
          payment: { select: { id: true, paymentNumber: true, amount: true, paymentMethod: true } },
          invoice: { select: { id: true, invoiceNumber: true, total: true } },
        },
      });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId,
        action: "REFUND_REQUESTED",
        resourceType: "refund",
        resourceId: refund.id,
        newValues: {
          paymentId: id,
          invoiceId: existing.invoiceId,
          amount: refundAmt,
          reason,
          refundMethod: refund.refundMethod,
        },
      });

      return NextResponse.json({ item: refund }, { status: 201 });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "Failed to create refund request" }, { status: 400 });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Supported actions: reverse, add_refund.` }, { status: 400 });
}
