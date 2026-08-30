// =====================================================================
// API: /api/authorizations
//   GET  — list insurance pre-authorizations
//   POST — create a new pre-authorization request
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
  if (!hasPermission(session, PERMISSIONS.INSURANCE_AUTHORIZATION_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const insuranceProviderId = url.searchParams.get("insuranceProviderId");
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (insuranceProviderId) where.insuranceProviderId = insuranceProviderId;
  if (status) where.status = status;

  // Filter by organization via the insurance provider relation
  if (Object.keys(where).length > 0 || true) {
    where.insuranceProvider = { organizationId: session.user.organizationId };
  }

  const items = await db.insuranceAuthorization.findMany({
    where,
    orderBy: { authorizationDate: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      insuranceProvider: { select: { id: true, name: true, code: true } },
      service: { select: { id: true, name: true, code: true, nhisServiceCode: true } },
    },
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_AUTHORIZATION_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    insuranceProviderId, insurancePlanId, patientId, patientInsuranceId,
    serviceId, authorizationNumber, authorizationDate, expiryDate,
    approvedService, approvedQuantity, approvedAmount,
    status, authorizedById, notes,
  } = body;

  if (!insuranceProviderId || !patientId) {
    return NextResponse.json({ error: "insuranceProviderId and patientId are required" }, { status: 400 });
  }

  // Validate organization via provider
  const provider = await db.insuranceProvider.findUnique({ where: { id: insuranceProviderId } });
  if (!provider || provider.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "InsuranceProvider not found" }, { status: 404 });
  }

  // Validate patient
  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  const item = await db.insuranceAuthorization.create({
    data: {
      organizationId: session.user.organizationId,
      insuranceProviderId,
      insurancePlanId: insurancePlanId || null,
      patientId,
      patientInsuranceId: patientInsuranceId || null,
      serviceId: serviceId || null,
      authorizationNumber: authorizationNumber || `AUTH-${Date.now()}`,
      authorizationDate: authorizationDate ? new Date(authorizationDate) : new Date(),
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      approvedService: approvedService || null,
      approvedQuantity: approvedQuantity || null,
      approvedAmount: approvedAmount || null,
      status: status || "pending",
      authorizedById: authorizedById || null,
      notes: notes || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "INSURANCE_AUTHORIZATION_CREATED",
    resourceType: "insuranceAuthorization",
    resourceId: item.id,
    newValues: {
      insuranceProviderId, patientId, serviceId,
      authorizationNumber: item.authorizationNumber, status: item.status,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}
