// =====================================================================
// API: /api/refunds/[id]
//   GET   — single refund with relations
//   PATCH — action: "approve" | "reject" | "process"
//           approve:  status=approved (by accountant; original payment UNCHANGED)
//           reject:   status=rejected
//           process:  status=processed + processedAt + processedById
//                     IMPORTANT: Does NOT modify the original payment. The audit trail
//                     of the original payment is preserved per financial integrity rules.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const refund = await db.refund.findUnique({
    where: { id },
    include: {
      payment: {
        select: {
          id: true, paymentNumber: true, amount: true, paymentMethod: true, receivedAt: true,
          receivedBy: { select: { id: true, firstName: true, lastName: true } },
          invoice: { select: { id: true, invoiceNumber: true, total: true } },
        },
      },
      invoice: { select: { id: true, invoiceNumber: true, total: true, balance: true, status: true } },
      processedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  if (!refund) return NextResponse.json({ error: "Refund not found" }, { status: 404 });
  return NextResponse.json({ item: refund });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_REFUND)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action } = body;

  const existing = await db.refund.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Refund not found" }, { status: 404 });

  // ---- APPROVE ----
  if (action === "approve") {
    if (existing.status !== "pending") {
      return NextResponse.json({ error: `Cannot approve refund with status: ${existing.status}` }, { status: 400 });
    }
    const updated = await db.refund.update({
      where: { id },
      data: { status: "approved", approvedById: session.user.id },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "REFUND_APPROVED",
      resourceType: "refund",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "approved", approvedById: session.user.id },
    });

    return NextResponse.json({ item: updated });
  }

  // ---- REJECT ----
  if (action === "reject") {
    if (!["pending", "approved"].includes(existing.status)) {
      return NextResponse.json({ error: `Cannot reject refund with status: ${existing.status}` }, { status: 400 });
    }
    const updated = await db.refund.update({
      where: { id },
      data: { status: "rejected" },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "REFUND_REJECTED",
      resourceType: "refund",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "rejected", reason: body.reason || null },
    });

    return NextResponse.json({ item: updated });
  }

  // ---- PROCESS ----
  if (action === "process") {
    if (existing.status !== "approved") {
      return NextResponse.json({ error: `Cannot process refund with status: ${existing.status}. Must be approved first.` }, { status: 400 });
    }

    // NOTE: We do NOT modify the original Payment record. The audit trail is preserved.
    // The refund itself is the financial record of money returned to the patient.
    const updated = await db.refund.update({
      where: { id },
      data: {
        status: "processed",
        processedById: session.user.id,
        processedAt: new Date(),
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "REFUND_PROCESSED",
      resourceType: "refund",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: {
        status: "processed",
        processedAt: new Date(),
        processedById: session.user.id,
        amount: existing.amount,
      },
    });

    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
