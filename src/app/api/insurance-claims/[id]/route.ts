// =====================================================================
// API: /api/insurance-claims/[id]
//   GET   — single claim with relations
//   PATCH — action: "submit" | "approve" | "partially_approve" | "reject" | "pay" | "resubmit"
//           submit:            status=submitted + submittedAt
//           approve:           status=approved + approvedAmount + approvedAt
//           partially_approve: status=partially_approved + approvedAmount + approvedAt
//           reject:            status=rejected + rejectedAt + rejectionReason
//           pay:               status=paid (creates an insurance payment against the invoice)
//           resubmit:          status=resubmitted → submitted
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextPaymentNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const claim = await db.insuranceClaim.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, phone: true } },
      facility: { select: { id: true, name: true, code: true } },
      insuranceProvider: { select: { id: true, name: true, code: true, phone: true, email: true } },
      invoice: {
        select: {
          id: true, invoiceNumber: true, total: true, amountPaid: true, balance: true, status: true,
          items: { include: { service: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  return NextResponse.json({ item: claim });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_CLAIM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action } = body;

  const existing = await db.insuranceClaim.findUnique({
    where: { id },
    include: { invoice: true },
  });
  if (!existing) return NextResponse.json({ error: "Claim not found" }, { status: 404 });

  // ---- SUBMIT ----
  if (action === "submit") {
    if (!["draft", "resubmitted"].includes(existing.status)) {
      return NextResponse.json({ error: `Cannot submit claim with status: ${existing.status}` }, { status: 400 });
    }
    const updated = await db.insuranceClaim.update({
      where: { id },
      data: { status: "submitted", submittedAt: new Date() },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "CLAIM_SUBMITTED",
      resourceType: "insurance_claim",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "submitted", submittedAt: new Date() },
    });

    return NextResponse.json({ item: updated });
  }

  // ---- APPROVE ----
  if (action === "approve" || action === "partially_approve") {
    if (existing.status !== "submitted") {
      return NextResponse.json({ error: `Cannot ${action} claim with status: ${existing.status}` }, { status: 400 });
    }
    const newStatus = action === "approve" ? "approved" : "partially_approved";
    const approvedAmount = action === "approve" ? existing.claimAmount : Number(body.approvedAmount) || 0;

    if (action === "partially_approve" && approvedAmount <= 0) {
      return NextResponse.json({ error: "approvedAmount must be > 0 for partial approval" }, { status: 400 });
    }

    const updated = await db.insuranceClaim.update({
      where: { id },
      data: {
        status: newStatus,
        approvedAmount,
        approvedAt: new Date(),
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "CLAIM_APPROVED",
      resourceType: "insurance_claim",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: newStatus, approvedAmount, approvedAt: new Date() },
    });

    return NextResponse.json({ item: updated });
  }

  // ---- REJECT ----
  if (action === "reject") {
    if (!["submitted", "approved", "partially_approved"].includes(existing.status)) {
      return NextResponse.json({ error: `Cannot reject claim with status: ${existing.status}` }, { status: 400 });
    }
    const updated = await db.insuranceClaim.update({
      where: { id },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectionReason: body.reason || null,
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "CLAIM_REJECTED",
      resourceType: "insurance_claim",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "rejected", rejectionReason: body.reason },
    });

    return NextResponse.json({ item: updated });
  }

  // ---- PAY (create an insurance payment against the invoice) ----
  if (action === "pay") {
    if (!["approved", "partially_approved"].includes(existing.status)) {
      return NextResponse.json({ error: `Cannot pay claim with status: ${existing.status}. Must be approved first.` }, { status: 400 });
    }

    try {
      const result = await db.$transaction(async (tx) => {
        // Mark claim paid
        const updated = await tx.insuranceClaim.update({
          where: { id },
          data: { status: "paid" },
        });

        // Create insurance payment against the invoice
        const paymentNumber = await nextPaymentNumber(existing.facilityId);
        const invoice = await tx.invoice.findUnique({ where: { id: existing.invoiceId } });
        if (!invoice) throw new Error("Invoice not found");

        const payment = await tx.payment.create({
          data: {
            invoiceId: existing.invoiceId,
            patientId: existing.patientId,
            facilityId: existing.facilityId,
            paymentNumber,
            amount: existing.approvedAmount || existing.claimAmount,
            paymentMethod: "insurance",
            transactionReference: `CLAIM-${existing.claimNumber}`,
            status: "completed",
            receivedById: session.user.id,
            receivedAt: new Date(),
          },
        });

        // Update invoice
        const newAmountPaid = invoice.amountPaid + payment.amount;
        const newBalance = Math.max(0, invoice.total - newAmountPaid);
        let newStatus = invoice.status;
        if (newBalance <= 0.001) newStatus = "paid";
        else if (newAmountPaid > 0) newStatus = "partially_paid";

        await tx.invoice.update({
          where: { id: invoice.id },
          data: { amountPaid: newAmountPaid, balance: newBalance, status: newStatus },
        });

        return { updated, payment };
      });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId,
        action: "CLAIM_PAID",
        resourceType: "insurance_claim",
        resourceId: id,
        oldValues: { status: existing.status },
        newValues: { status: "paid", paymentId: result.payment.id },
      });

      return NextResponse.json({ item: result.updated, payment: result.payment });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "Failed to pay claim" }, { status: 400 });
    }
  }

  // ---- RESUBMIT ----
  if (action === "resubmit") {
    if (existing.status !== "rejected") {
      return NextResponse.json({ error: `Cannot resubmit claim with status: ${existing.status}` }, { status: 400 });
    }
    const updated = await db.insuranceClaim.update({
      where: { id },
      data: { status: "resubmitted", submittedAt: new Date(), rejectionReason: null },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "CLAIM_RESUBMITTED",
      resourceType: "insurance_claim",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "resubmitted" },
    });

    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
