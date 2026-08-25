// =====================================================================
// API: /api/insurance-providers/[id]/facilities
//   GET  — list facility relationships for a provider
//   POST — add/update a facility relationship
//   DELETE — remove a facility relationship (?facilityId=...)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

async function getProvider(session: any, id: string) {
  const provider = await db.insuranceProvider.findUnique({ where: { id } });
  if (!provider || provider.organizationId !== session.user.organizationId) return null;
  return provider;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW) && !hasPermission(session, PERMISSIONS.INSURANCE_PROVIDER_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const provider = await getProvider(session, id);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const relationships = await db.providerFacilityRelationship.findMany({
    where: { insuranceProviderId: id },
    orderBy: { facilityId: "asc" },
  });
  return NextResponse.json({ items: relationships, count: relationships.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_PROVIDER_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const provider = await getProvider(session, id);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { facilityId, availability, acceptedPlans, contractReference, effectiveDate, endDate, notes } = body;
  if (!facilityId) return NextResponse.json({ error: "facilityId is required" }, { status: 400 });
  // Upsert
  const item = await db.providerFacilityRelationship.upsert({
    where: { insuranceProviderId_facilityId: { insuranceProviderId: id, facilityId } },
    update: {
      availability: availability || "available",
      acceptedPlans: acceptedPlans || null,
      contractReference: contractReference || null,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      notes: notes || null,
    },
    create: {
      insuranceProviderId: id,
      facilityId,
      availability: availability || "available",
      acceptedPlans: acceptedPlans || null,
      contractReference: contractReference || null,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      notes: notes || null,
    },
  });
  await auditLog({
    userId: session.user.id, organizationId: session.user.organizationId,
    action: "PROVIDER_FACILITY_UPDATED", resourceType: "insurance_provider", resourceId: id,
    newValues: { facilityId, availability },
  });
  return NextResponse.json({ item }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_PROVIDER_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  if (!facilityId) return NextResponse.json({ error: "facilityId is required" }, { status: 400 });
  await db.providerFacilityRelationship.delete({
    where: { insuranceProviderId_facilityId: { insuranceProviderId: id, facilityId } },
  });
  return NextResponse.json({ ok: true });
}
