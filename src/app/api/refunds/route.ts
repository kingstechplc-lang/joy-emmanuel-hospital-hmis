// =====================================================================
// API: /api/refunds
//   GET  — list refunds (filter by facility, status, payment, invoice)
//   POST — request refund (status=pending). Does NOT modify the original payment.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/refunds?facilityId=...&status=...&paymentId=...&invoiceId=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const paymentId = url.searchParams.get("paymentId");
  const invoiceId = url.searchParams.get("invoiceId");
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const where: any = {};
  if (facilityId) where.payment = { facilityId };
  if (status) where.status = status;
  if (paymentId) where.paymentId = paymentId;
  if (invoiceId) where.invoiceId = invoiceId;

  const refunds = await db.refund.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      payment: {
        select: {
          id: true, paymentNumber: true, amount: true, paymentMethod: true, receivedAt: true,
          invoice: { select: { id: true, invoiceNumber: true } },
        },
      },
      invoice: { select: { id: true, invoiceNumber: true, total: true } },
      processedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: refunds, count: refunds.length });
}

// POST /api/refunds
// body: { paymentId, invoiceId, amount, reason }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_REFUND)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { paymentId, invoiceId, amount, reason } = body;

  if (!paymentId || !invoiceId || !amount || !reason) {
    return NextResponse.json({ error: "paymentId, invoiceId, amount, reason are required" }, { status: 400 });
  }

  // Validate payment
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (payment.invoiceId !== invoiceId) {
    return NextResponse.json({ error: "Payment does not belong to the specified invoice" }, { status: 400 });
  }
  const refundAmt = Number(amount);
  if (refundAmt <= 0 || refundAmt > payment.amount) {
    return NextResponse.json({ error: `Refund amount must be between 0 and ${payment.amount}` }, { status: 400 });
  }

  // Check for existing pending/approved refunds that would exceed the payment amount
  const existingRefunds = await db.refund.aggregate({
    where: { paymentId, status: { in: ["pending", "approved", "processed"] } },
    _sum: { amount: true },
  });
  const alreadyRefunded = existingRefunds._sum.amount || 0;
  if (alreadyRefunded + refundAmt > payment.amount) {
    return NextResponse.json({
      error: `Total refunds would exceed payment amount. Payment: ${payment.amount}, already requested: ${alreadyRefunded}, requested: ${refundAmt}`,
    }, { status: 400 });
  }

  const refund = await db.refund.create({
    data: {
      paymentId,
      invoiceId,
      amount: refundAmt,
      reason,
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
    facilityId: payment.facilityId,
    action: "REFUND_REQUESTED",
    resourceType: "refund",
    resourceId: refund.id,
    newValues: { paymentId, invoiceId, amount: refundAmt, reason },
  });

  return NextResponse.json({ item: refund }, { status: 201 });
}
