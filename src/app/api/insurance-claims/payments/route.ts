// =====================================================================
// API: /api/insurance-claims/payments
//   GET  — list payments (filter by claimId)
//   POST — record a payer payment against a claim
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const claimId = url.searchParams.get("claimId");

  const where: any = {};
  if (claimId) where.claimId = claimId;

  const items = await db.claimPayment.findMany({
    where,
    orderBy: { paymentDate: "desc" },
    take: 100,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_CLAIM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { claimId, paymentReference, paymentDate, amount, adjustment, paymentStatus, notes } = body;
  if (!claimId || !amount) {
    return NextResponse.json({ error: "claimId and amount are required" }, { status: 400 });
  }

  const claim = await db.insuranceClaim.findUnique({ where: { id: claimId } });
  if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 });

  const item = await db.claimPayment.create({
    data: {
      claimId,
      paymentReference: paymentReference || null,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      amount: Number(amount),
      adjustment: Number(adjustment) || 0,
      paymentStatus: paymentStatus || "received",
      notes: notes || null,
      recordedById: session.user.id,
      recordedByName: session.user.name || undefined,
    },
  });

  // Check if claim is fully paid
  const allPayments = await db.claimPayment.findMany({ where: { claimId }, select: { amount: true } });
  const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);
  const approvedAmount = claim.approvedAmount || claim.claimAmount;

  if (totalPaid >= approvedAmount) {
    await db.insuranceClaim.update({ where: { id: claimId }, data: { status: "paid" } });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: claim.facilityId,
    action: "CLAIM_PAYMENT_RECORDED",
    resourceType: "claimPayment",
    resourceId: item.id,
    newValues: { claimId, amount, paymentReference },
  });

  return NextResponse.json({ item }, { status: 201 });
}
