// =====================================================================
// API: /api/refunds
//   GET  — list refunds with full filtering + relations
//            filters: facilityId, status, paymentId, invoiceId,
//                      refundType, refundMethod, from, to, q (search),
//                      limit
//   POST — request refund (status=pending). Generates refundNumber
//          (REF-YYYY-NNNNNN). Validates amount against the payment's
//          available refundable amount (payment.amount minus all
//          non-rejected/non-cancelled existing refund amounts).
//          Accepts: refundType, refundSource, refundMethod,
//          externalReference, notes, patientId, facilityId.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Refund statuses that count toward the consumed refundable amount on a payment.
// Rejected / cancelled refunds release their hold; reversed refunds already
// returned funds; failed refunds are excluded as well so they can be retried
// against fresh allocation only after success.
const CONSUMING_STATUSES = ["pending", "reviewed", "approved", "processing", "completed", "reversed", "failed"];

// All user-relation selects used across the refund lifecycle.
const USER_SELECT = { id: true, firstName: true, lastName: true, username: true } as const;

// Generate a unique refund number: REF-YYYY-NNNNNN
async function generateRefundNumber(): Promise<string> {
  const year = new Date().getFullYear();
  // Try a few times in case of a race / unique collision
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const count = await db.refund.count({
        where: { refundNumber: { startsWith: `REF-${year}-` } },
      });
      const candidate = `REF-${year}-${String(count + 1).padStart(6, "0")}`;
      // Confirm uniqueness
      const existing = await db.refund.findUnique({ where: { refundNumber: candidate } });
      if (!existing) return candidate;
    } catch {
      // fall through and retry
    }
  }
  // Fallback: timestamp-based uniqueness
  return `REF-${year}-${Date.now().toString().slice(-6)}`;
}

// GET /api/refunds
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
  const refundType = url.searchParams.get("refundType");
  const refundMethod = url.searchParams.get("refundMethod");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  // Build the where clause
  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (paymentId) where.paymentId = paymentId;
  if (invoiceId) where.invoiceId = invoiceId;
  if (refundType) where.refundType = refundType;
  if (refundMethod) where.refundMethod = refundMethod;

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999`);
  }

  // Free-text search by refund number, payment number, invoice number, patient name
  if (q) {
    where.OR = [
      { refundNumber: { contains: q, mode: "insensitive" } },
      { reason: { contains: q, mode: "insensitive" } },
      { externalReference: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      {
        payment: {
          OR: [
            { paymentNumber: { contains: q, mode: "insensitive" } },
            { transactionReference: { contains: q, mode: "insensitive" } },
            {
              patient: {
                OR: [
                  { patientNumber: { contains: q, mode: "insensitive" } },
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          ],
        },
      },
      {
        invoice: {
          invoiceNumber: { contains: q, mode: "insensitive" },
        },
      },
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

  let refunds: any[] = [];
  try {
    refunds = await db.refund.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        payment: {
          select: {
            id: true, paymentNumber: true, amount: true, paymentMethod: true,
            transactionReference: true, status: true, receivedAt: true,
            patient: {
              select: { id: true, patientNumber: true, firstName: true, lastName: true, phone: true },
            },
            invoice: { select: { id: true, invoiceNumber: true, total: true, balance: true } },
          },
        },
        invoice: {
          select: { id: true, invoiceNumber: true, total: true, balance: true, status: true, amountRefunded: true },
        },
        requestedBy: { select: USER_SELECT },
        reviewedBy: { select: USER_SELECT },
        approvedBy: { select: USER_SELECT },
        rejectedBy: { select: USER_SELECT },
        processedBy: { select: USER_SELECT },
        cancelledBy: { select: USER_SELECT },
        reversedBy: { select: USER_SELECT },
        verifiedBy: { select: USER_SELECT },
      },
    });
  } catch (e: any) {
    // Resilient: never 500 the dashboard; return empty list on error.
    console.error("GET /api/refunds failed:", e);
    return NextResponse.json({ items: [], count: 0, error: "failed_to_load" });
  }

  return NextResponse.json({ items: refunds, count: refunds.length });
}

// POST /api/refunds
// body: { paymentId, invoiceId, amount, reason,
//         refundType?, refundSource?, refundMethod?,
//         externalReference?, notes?, patientId?, facilityId? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_REFUND)) {
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
    paymentId, invoiceId, amount, reason,
    refundType, refundSource, refundMethod,
    externalReference, notes, patientId, facilityId,
  } = body;

  if (!paymentId || !invoiceId || !amount || !reason) {
    return NextResponse.json(
      { error: "paymentId, invoiceId, amount, reason are required" },
      { status: 400 }
    );
  }

  // Validate payment
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      invoice: { select: { id: true, invoiceNumber: true, total: true, balance: true, amountRefunded: true } },
    },
  });
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (payment.invoiceId !== invoiceId) {
    return NextResponse.json(
      { error: "Payment does not belong to the specified invoice" },
      { status: 400 }
    );
  }

  const refundAmt = Number(amount);
  if (!Number.isFinite(refundAmt) || refundAmt <= 0) {
    return NextResponse.json({ error: "Refund amount must be greater than 0" }, { status: 400 });
  }
  if (refundAmt > payment.amount) {
    return NextResponse.json(
      { error: `Refund amount (${refundAmt}) cannot exceed payment amount (${payment.amount})` },
      { status: 400 }
    );
  }

  // Check existing refunds that consume the refundable amount on this payment
  // (excludes rejected/cancelled — those release their hold).
  const existingRefunds = await db.refund.aggregate({
    where: { paymentId, status: { in: CONSUMING_STATUSES } },
    _sum: { amount: true },
  });
  const alreadyRefunded = Number(existingRefunds._sum.amount || 0);
  const availableRefundable = payment.amount - alreadyRefunded;
  if (refundAmt > availableRefundable) {
    return NextResponse.json(
      {
        error: `Refund amount exceeds available refundable. Payment: ${payment.amount}, already allocated: ${alreadyRefunded}, available: ${availableRefundable}, requested: ${refundAmt}`,
      },
      { status: 400 }
    );
  }

  // Generate a refund number
  const refundNumber = await generateRefundNumber();

  // Resolve patient & facility (fall back to the payment's values)
  const effectivePatientId = patientId || payment.patientId || null;
  const effectiveFacilityId = facilityId || payment.facilityId || null;

  let refund: any;
  try {
    refund = await db.refund.create({
      data: {
        refundNumber,
        paymentId,
        invoiceId,
        patientId: effectivePatientId,
        facilityId: effectiveFacilityId,
        amount: refundAmt,
        reason,
        refundType: refundType || "full",
        refundSource: refundSource || null,
        refundMethod: refundMethod || null,
        externalReference: externalReference || null,
        notes: notes || null,
        requestedById: session.user.id,
        status: "pending",
      },
      include: {
        payment: {
          select: {
            id: true, paymentNumber: true, amount: true, paymentMethod: true,
            patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
            invoice: { select: { id: true, invoiceNumber: true, total: true } },
          },
        },
        invoice: { select: { id: true, invoiceNumber: true, total: true, balance: true } },
        requestedBy: { select: USER_SELECT },
      },
    });
  } catch (e: any) {
    console.error("POST /api/refunds create failed:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to create refund" },
      { status: 500 }
    );
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: effectiveFacilityId || undefined,
    action: "REFUND_REQUESTED",
    resourceType: "refund",
    resourceId: refund.id,
    newValues: {
      refundNumber,
      paymentId,
      invoiceId,
      patientId: effectivePatientId,
      amount: refundAmt,
      reason,
      refundType: refundType || "full",
      refundSource,
      refundMethod,
      externalReference,
      notes,
    },
  });

  return NextResponse.json({ item: refund }, { status: 201 });
}
