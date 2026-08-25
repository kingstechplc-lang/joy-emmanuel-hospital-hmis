// =====================================================================
// API: /api/insurance-providers/[id]
//   GET    — fetch provider (with plans, contacts, facility relationships)
//   PATCH  — update provider fields
//   DELETE — soft-delete (status = "inactive")
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW) &&
      !hasPermission(session, PERMISSIONS.INSURANCE_PROVIDER_VIEW) &&
      !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const provider = await db.insuranceProvider.findUnique({
    where: { id },
    include: {
      plans: {
        include: {
          _count: { select: { serviceCoverage: true, benefits: true, authorizations: true } },
        },
        orderBy: { name: "asc" },
      },
      contacts: { orderBy: { contactType: "asc" } },
      facilityRelationships: true,
      _count: { select: { patientInsurance: true, insuranceClaims: true } },
    },
  });
  if (!provider || provider.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item: provider });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_PROVIDER_MANAGE) &&
      !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
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

  const existing = await db.insuranceProvider.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowedFields = [
    "name", "code", "legalName", "shortName", "displayName", "providerType",
    "organizationType", "country", "region", "phone", "email", "website",
    "address", "postalAddress", "contactPerson", "claimsContact", "financeContact",
    "status", "notes",
  ];
  const updateData: any = {};
  for (const f of allowedFields) {
    if (body[f] !== undefined) updateData[f] = body[f] || null;
  }
  // Date fields
  if (body.effectiveDate !== undefined) updateData.effectiveDate = body.effectiveDate ? new Date(body.effectiveDate) : null;
  if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null;
  updateData.updatedById = session.user.id;

  // Check code uniqueness
  if (updateData.code && updateData.code !== existing.code) {
    const codeOwner = await db.insuranceProvider.findUnique({
      where: { organizationId_code: { organizationId: existing.organizationId, code: updateData.code } },
    });
    if (codeOwner && codeOwner.id !== id) {
      return NextResponse.json({ error: "Code already in use" }, { status: 409 });
    }
  }

  // Retirement status check
  const retirementStatuses = ["retired", "terminated"];
  if (retirementStatuses.includes(updateData.status) && !hasPermission(session, PERMISSIONS.INSURANCE_PROVIDER_ARCHIVE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Missing permission to retire/terminate providers" }, { status: 403 });
  }

  const updated = await db.insuranceProvider.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "INSURANCE_PROVIDER_UPDATED",
    resourceType: "insurance_provider",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code, status: existing.status, providerType: existing.providerType },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_PROVIDER_ARCHIVE) &&
      !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.insuranceProvider.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Soft delete — set status to inactive (preserve historical data)
  await db.insuranceProvider.update({ where: { id }, data: { status: "inactive", updatedById: session.user.id } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "INSURANCE_PROVIDER_DELETED",
    resourceType: "insurance_provider",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code, status: existing.status },
  });
  return NextResponse.json({ ok: true });
}
