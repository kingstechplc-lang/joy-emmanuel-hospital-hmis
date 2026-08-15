// =====================================================================
// API: /api/payments
//   GET  — list payments (filter by facility, method, date range)
//   POST — create payment + update invoice (transactional):
//          invoice.amountPaid += amount, balance -= amount,
//          status transitions to partially_paid or paid.
//          Auto-generate payment_number.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextPaymentNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

// GET /api/payments?facilityId=...&method=...&from=...&to=...&patientId=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const method = url.searchParams.get("method");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const patientId = url.searchParams.get("patientId");
  const invoiceId = url.searchParams.get("invoiceId");
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (method) where.paymentMethod = method;
  if (patientId) where.patientId = patientId;
  if (invoiceId) where.invoiceId = invoiceId;
  if (from || to) {
    where.receivedAt = {};
    if (from) where.receivedAt.gte = new Date(from);
    if (to) where.receivedAt.lte = new Date(to);
  }

  const payments = await db.payment.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      facility: { select: { id: true, name: true, code: true } },
      invoice: { select: { id: true, invoiceNumber: true, total: true, balance: true, status: true } },
      receivedBy: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { refunds: true } },
    },
  });

  return NextResponse.json({ items: payments, count: payments.length });
}

// POST /api/payments
// body: { invoiceId, patientId, facilityId, amount, paymentMethod, transactionReference? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_PAYMENT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { invoiceId, patientId, facilityId, amount, paymentMethod, transactionReference } = body;

  if (!invoiceId || !patientId || !facilityId || !amount || !paymentMethod) {
    return NextResponse.json({ error: "invoiceId, patientId, facilityId, amount, paymentMethod are required" }, { status: 400 });
  }

  const VALID_METHODS = ["cash", "mobile_money", "card", "bank", "insurance", "other"];
  if (!VALID_METHODS.includes(paymentMethod)) {
    return NextResponse.json({ error: `Invalid paymentMethod. Must be one of: ${VALID_METHODS.join(", ")}` }, { status: 400 });
  }

  try {
    const paymentNumber = await nextPaymentNumber(facilityId);
    const amt = Number(amount);

    const result = await db.$transaction(async (tx) => {
      // 1. Lock the invoice + verify it's not cancelled
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.status === "cancelled") {
        throw new Error("Cannot accept payment on a cancelled invoice");
      }
      if (invoice.patientId !== patientId) {
        throw new Error("Patient does not match the invoice");
      }

      // 2. Create payment
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          patientId,
          facilityId,
          paymentNumber,
          amount: amt,
          paymentMethod,
          transactionReference: transactionReference || null,
          status: "completed",
          receivedById: session.user.id,
          receivedAt: new Date(),
        },
      });

      // 3. Update invoice
      const newAmountPaid = invoice.amountPaid + amt;
      const newBalance = Math.max(0, invoice.total - newAmountPaid);
      let newStatus = invoice.status;
      if (newBalance <= 0.001) newStatus = "paid";
      else if (newAmountPaid > 0) newStatus = "partially_paid";

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid: newAmountPaid,
          balance: newBalance,
          status: newStatus,
        },
      });

      return { payment, updatedInvoice };
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId,
      action: "PAYMENT_RECEIVED",
      resourceType: "payment",
      resourceId: result.payment.id,
      newValues: {
        paymentNumber,
        invoiceId,
        amount: amt,
        paymentMethod,
        invoiceNewStatus: result.updatedInvoice.status,
        invoiceNewBalance: result.updatedInvoice.balance,
      },
    });

    return NextResponse.json({ item: result.payment, invoice: result.updatedInvoice }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to record payment" }, { status: 400 });
  }
}
