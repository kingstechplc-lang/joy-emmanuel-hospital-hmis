// =====================================================================
// API: /api/insurance-claims
//   GET  — list claims (filter by facility, status, patient, provider)
//   POST — create claim (status=draft). Auto-generate claim_number.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextClaimNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/insurance-claims?facilityId=...&status=...&patientId=...&providerId=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");
  const providerId = url.searchParams.get("providerId");
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (patientId) where.patientId = patientId;
  if (providerId) where.insuranceProviderId = providerId;

  const claims = await db.insuranceClaim.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, phone: true } },
      facility: { select: { id: true, name: true, code: true } },
      insuranceProvider: { select: { id: true, name: true, code: true } },
      invoice: { select: { id: true, invoiceNumber: true, total: true, balance: true, status: true } },
    },
  });

  return NextResponse.json({ items: claims, count: claims.length });
}

// POST /api/insurance-claims
// body: { patientId, facilityId, insuranceProviderId, invoiceId, claimAmount, status? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_CLAIM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { patientId, facilityId, insuranceProviderId, invoiceId, claimAmount } = body;

  if (!patientId || !facilityId || !insuranceProviderId || !invoiceId) {
    return NextResponse.json({ error: "patientId, facilityId, insuranceProviderId, invoiceId are required" }, { status: 400 });
  }

  // Validate invoice belongs to patient
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.patientId !== patientId) {
    return NextResponse.json({ error: "Invoice does not belong to the specified patient" }, { status: 400 });
  }
  if (invoice.balance <= 0) {
    return NextResponse.json({ error: "Invoice has no outstanding balance to claim against" }, { status: 400 });
  }

  const claimNumber = await nextClaimNumber(facilityId);

  const claim = await db.insuranceClaim.create({
    data: {
      patientId,
      facilityId,
      insuranceProviderId,
      invoiceId,
      claimNumber,
      claimAmount: Number(claimAmount) || invoice.balance,
      approvedAmount: 0,
      status: "draft",
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      insuranceProvider: { select: { id: true, name: true, code: true } },
      invoice: { select: { id: true, invoiceNumber: true, total: true, balance: true, status: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "CLAIM_CREATED",
    resourceType: "insurance_claim",
    resourceId: claim.id,
    newValues: { claimNumber, patientId, invoiceId, insuranceProviderId, claimAmount: claim.claimAmount },
  });

  return NextResponse.json({ item: claim }, { status: 201 });
}
