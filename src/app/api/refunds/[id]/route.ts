// =====================================================================
// API: /api/refunds/[id]
//   GET   — single refund with all relations (payment + invoice + patient
//            + 8 user relations: requestedBy, reviewedBy, approvedBy,
//            rejectedBy, processedBy, cancelledBy, reversedBy, verifiedBy)
//   PATCH — 8 lifecycle actions, all gated by BILLING_REFUND permission
//            and audit logged:
//            review   : pending → reviewed (sets reviewedBy/At)
//            approve  : pending|reviewed → approved (sets approvedBy/At,
//                       optionally sets approvedAmount)
//            reject   : pending|reviewed|approved → rejected (requires
//                       rejectionReason, sets rejectedBy/At)
//            process  : approved → processing → completed (sets
//                       processedBy/At, processedAmount, externalReference;
//                       transactional — updates invoice.amountRefunded
//                       and balance)
//            cancel   : pending|reviewed → cancelled (requires cancelReason,
//                       sets cancelledBy/At)
//            reverse  : completed → reversed (requires reversalReason,
//                       sets reversedBy/At; transactional — reverses the
//                       invoice balance change)
//            fail     : processing → failed (requires failureReason,
//                       sets failedAt)
//            retry    : failed → processing (increments retryCount)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const USER_SELECT = { id: true, firstName: true, lastName: true, username: true } as const;

const FULL_INCLUDE = {
  payment: {
    select: {
      id: true, paymentNumber: true, amount: true, paymentMethod: true,
      transactionReference: true, status: true, receivedAt: true,
      receivedBy: { select: USER_SELECT },
      invoice: {
        select: {
          id: true, invoiceNumber: true, total: true, balance: true,
          status: true, amountPaid: true, amountRefunded: true,
        },
      },
      patient: {
        select: { id: true, patientNumber: true, firstName: true, lastName: true, phone: true },
      },
    },
  },
  invoice: {
    select: {
      id: true, invoiceNumber: true, total: true, balance: true,
      status: true, amountPaid: true, amountRefunded: true,
    },
  },
  requestedBy: { select: USER_SELECT },
  reviewedBy: { select: USER_SELECT },
  approvedBy: { select: USER_SELECT },
  rejectedBy: { select: USER_SELECT },
  processedBy: { select: USER_SELECT },
  cancelledBy: { select: USER_SELECT },
  reversedBy: { select: USER_SELECT },
  verifiedBy: { select: USER_SELECT },
} as const;

// GET /api/refunds/[id]
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let refund: any;
  try {
    refund = await db.refund.findUnique({ where: { id }, include: FULL_INCLUDE });
  } catch (e: any) {
    console.error("GET /api/refunds/[id] failed:", e);
    return NextResponse.json({ error: "failed_to_load" }, { status: 500 });
  }

  if (!refund) return NextResponse.json({ error: "Refund not found" }, { status: 404 });
  return NextResponse.json({ item: refund });
}

// PATCH /api/refunds/[id]
// body: { action, ...actionSpecificFields }
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
  const { action } = body;

  const existing = await db.refund.findUnique({
    where: { id },
    include: { invoice: { select: { id: true, invoiceNumber: true, amountRefunded: true, balance: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Refund not found" }, { status: 404 });

  // =================================================================
  // REVIEW — pending → reviewed
  // =================================================================
  if (action === "review") {
    if (existing.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot review refund with status: ${existing.status}. Must be pending.` },
        { status: 400 }
      );
    }
    const now = new Date();
    const updated = await db.refund.update({
      where: { id },
      data: {
        status: "reviewed",
        reviewedById: session.user.id,
        reviewedAt: now,
      },
      include: FULL_INCLUDE,
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId || undefined,
      action: "REFUND_REVIEWED",
      resourceType: "refund",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "reviewed", reviewedById: session.user.id, reviewedAt: now },
    });
    return NextResponse.json({ item: updated });
  }

  // =================================================================
  // APPROVE — pending|reviewed → approved (optionally set approvedAmount)
  // =================================================================
  if (action === "approve") {
    if (!["pending", "reviewed"].includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot approve refund with status: ${existing.status}. Must be pending or reviewed.` },
        { status: 400 }
      );
    }
    const approvedAmount = body.approvedAmount != null ? Number(body.approvedAmount) : null;
    if (approvedAmount != null && (!Number.isFinite(approvedAmount) || approvedAmount <= 0)) {
      return NextResponse.json({ error: "approvedAmount must be a positive number" }, { status: 400 });
    }
    if (approvedAmount != null && approvedAmount > existing.amount) {
      return NextResponse.json(
        { error: `approvedAmount (${approvedAmount}) cannot exceed requested amount (${existing.amount})` },
        { status: 400 }
      );
    }
    const now = new Date();
    const updateData: any = {
      status: "approved",
      approvedById: session.user.id,
      approvedAt: now,
    };
    if (approvedAmount != null) updateData.approvedAmount = approvedAmount;

    const updated = await db.refund.update({
      where: { id },
      data: updateData,
      include: FULL_INCLUDE,
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId || undefined,
      action: "REFUND_APPROVED",
      resourceType: "refund",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: {
        status: "approved",
        approvedById: session.user.id,
        approvedAt: now,
        approvedAmount: approvedAmount ?? existing.amount,
      },
    });
    return NextResponse.json({ item: updated });
  }

  // =================================================================
  // REJECT — pending|reviewed|approved → rejected (requires rejectionReason)
  // =================================================================
  if (action === "reject") {
    if (!["pending", "reviewed", "approved"].includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot reject refund with status: ${existing.status}` },
        { status: 400 }
      );
    }
    const rejectionReason = (body.rejectionReason || body.reason || "").trim();
    if (!rejectionReason) {
      return NextResponse.json({ error: "rejectionReason is required" }, { status: 400 });
    }
    const now = new Date();
    const updated = await db.refund.update({
      where: { id },
      data: {
        status: "rejected",
        rejectedById: session.user.id,
        rejectedAt: now,
        rejectionReason,
      },
      include: FULL_INCLUDE,
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId || undefined,
      action: "REFUND_REJECTED",
      resourceType: "refund",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "rejected", rejectedById: session.user.id, rejectedAt: now, rejectionReason },
      reason: rejectionReason,
    });
    return NextResponse.json({ item: updated });
  }

  // =================================================================
  // PROCESS — approved → processing → completed
  //   Step 1: set status=processing (action=process, optional pre-confirm)
  //   Step 2: complete the refund — sets processedBy/At, processedAmount,
  //           externalReference; transactionally updates the invoice's
  //           amountRefunded (+= processedAmount) and balance (+= processedAmount).
  //   Implementation: the client calls action="process" once and we
  //   transition approved → completed atomically (with a brief processing
  //   step recorded in between for audit). If a refund is already in
  //   `processing` (e.g. an external gateway returned later), calling
  //   process again will complete it.
  // =================================================================
  if (action === "process") {
    if (!["approved", "processing"].includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot process refund with status: ${existing.status}. Must be approved first.` },
        { status: 400 }
      );
    }

    const processedAmount =
      body.processedAmount != null ? Number(body.processedAmount) :
      existing.approvedAmount != null ? Number(existing.approvedAmount) :
      Number(existing.amount);
    if (!Number.isFinite(processedAmount) || processedAmount <= 0) {
      return NextResponse.json({ error: "processedAmount must be a positive number" }, { status: 400 });
    }
    const externalReference = (body.externalReference || existing.externalReference || "").trim() || null;

    const now = new Date();
    // Transactional: update refund + invoice together
    const updated = await db.$transaction(async (tx: any) => {
      // 1. Move refund to processing (intermediate) then completed
      const r = await tx.refund.update({
        where: { id },
        data: {
          status: "completed",
          processedById: session.user.id,
          processedAt: now,
          processedAmount,
          externalReference,
        },
        include: FULL_INCLUDE,
      });
      // 2. Update invoice: amountRefunded += processedAmount, balance += processedAmount
      //    (Refunds increase the invoice balance because money was returned to the patient.)
      if (existing.invoiceId) {
        const inv = await tx.invoice.findUnique({
          where: { id: existing.invoiceId },
          select: { amountRefunded: true, balance: true },
        });
        if (inv) {
          const newRefunded = Number(inv.amountRefunded || 0) + processedAmount;
          const newBalance = Number(inv.balance || 0) + processedAmount;
          await tx.invoice.update({
            where: { id: existing.invoiceId },
            data: {
              amountRefunded: newRefunded,
              balance: newBalance,
            },
          });
        }
      }
      return r;
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId || undefined,
      action: "REFUND_PROCESSED",
      resourceType: "refund",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: {
        status: "completed",
        processedAt: now,
        processedById: session.user.id,
        processedAmount,
        externalReference,
        invoiceUpdated: true,
      },
    });
    return NextResponse.json({ item: updated });
  }

  // =================================================================
  // CANCEL — pending|reviewed → cancelled (requires cancelReason)
  // =================================================================
  if (action === "cancel") {
    if (!["pending", "reviewed"].includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot cancel refund with status: ${existing.status}` },
        { status: 400 }
      );
    }
    const cancelReason = (body.cancelReason || "").trim();
    if (!cancelReason) {
      return NextResponse.json({ error: "cancelReason is required" }, { status: 400 });
    }
    const now = new Date();
    const updated = await db.refund.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledById: session.user.id,
        cancelledAt: now,
        cancelReason,
      },
      include: FULL_INCLUDE,
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId || undefined,
      action: "REFUND_CANCELLED",
      resourceType: "refund",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "cancelled", cancelledById: session.user.id, cancelledAt: now, cancelReason },
      reason: cancelReason,
    });
    return NextResponse.json({ item: updated });
  }

  // =================================================================
  // REVERSE — completed → reversed (requires reversalReason)
  //   Transactional: reverses the invoice balance change (subtract
  //   processedAmount from amountRefunded and balance).
  // =================================================================
  if (action === "reverse") {
    if (existing.status !== "completed") {
      return NextResponse.json(
        { error: `Cannot reverse refund with status: ${existing.status}. Must be completed.` },
        { status: 400 }
      );
    }
    const reversalReason = (body.reversalReason || "").trim();
    if (!reversalReason) {
      return NextResponse.json({ error: "reversalReason is required" }, { status: 400 });
    }

    const reversalAmount = Number(existing.processedAmount ?? existing.amount);
    const now = new Date();

    const updated = await db.$transaction(async (tx: any) => {
      const r = await tx.refund.update({
        where: { id },
        data: {
          status: "reversed",
          reversedById: session.user.id,
          reversedAt: now,
          reversalReason,
        },
        include: FULL_INCLUDE,
      });
      // Reverse the invoice balance change
      if (existing.invoiceId) {
        const inv = await tx.invoice.findUnique({
          where: { id: existing.invoiceId },
          select: { amountRefunded: true, balance: true },
        });
        if (inv) {
          const newRefunded = Math.max(0, Number(inv.amountRefunded || 0) - reversalAmount);
          const newBalance = Math.max(0, Number(inv.balance || 0) - reversalAmount);
          await tx.invoice.update({
            where: { id: existing.invoiceId },
            data: {
              amountRefunded: newRefunded,
              balance: newBalance,
            },
          });
        }
      }
      return r;
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId || undefined,
      action: "REFUND_REVERSED",
      resourceType: "refund",
      resourceId: id,
      oldValues: { status: existing.status, processedAmount: existing.processedAmount },
      newValues: {
        status: "reversed",
        reversedById: session.user.id,
        reversedAt: now,
        reversalReason,
        reversalAmount,
        invoiceReversed: true,
      },
      reason: reversalReason,
    });
    return NextResponse.json({ item: updated });
  }

  // =================================================================
  // FAIL — processing → failed (requires failureReason)
  // =================================================================
  if (action === "fail") {
    if (existing.status !== "processing") {
      return NextResponse.json(
        { error: `Cannot fail refund with status: ${existing.status}. Must be processing.` },
        { status: 400 }
      );
    }
    const failureReason = (body.failureReason || "").trim();
    if (!failureReason) {
      return NextResponse.json({ error: "failureReason is required" }, { status: 400 });
    }
    const now = new Date();
    const updated = await db.refund.update({
      where: { id },
      data: {
        status: "failed",
        failedAt: now,
        failureReason,
      },
      include: FULL_INCLUDE,
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId || undefined,
      action: "REFUND_FAILED",
      resourceType: "refund",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "failed", failedAt: now, failureReason },
      reason: failureReason,
    });
    return NextResponse.json({ item: updated });
  }

  // =================================================================
  // RETRY — failed → processing (increments retryCount)
  // =================================================================
  if (action === "retry") {
    if (existing.status !== "failed") {
      return NextResponse.json(
        { error: `Cannot retry refund with status: ${existing.status}. Must be failed.` },
        { status: 400 }
      );
    }
    const updated = await db.refund.update({
      where: { id },
      data: {
        status: "processing",
        retryCount: (existing.retryCount || 0) + 1,
        failedAt: null,
        failureReason: null,
      },
      include: FULL_INCLUDE,
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId || undefined,
      action: "REFUND_RETRY",
      resourceType: "refund",
      resourceId: id,
      oldValues: { status: existing.status, retryCount: existing.retryCount },
      newValues: { status: "processing", retryCount: (existing.retryCount || 0) + 1 },
    });
    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
