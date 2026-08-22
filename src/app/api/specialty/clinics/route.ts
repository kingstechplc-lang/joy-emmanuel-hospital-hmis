// =====================================================================
// API: /api/specialty/clinics
//   GET  — list clinic configurations
//   POST — create a new clinic configuration
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const code = url.searchParams.get("code");
  const isActive = url.searchParams.get("isActive");

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) {
    where.facilityId = facilityId;
  } else {
    where.facilityId = { in: orgFacilityIds };
  }
  if (code) where.code = code;
  if (isActive !== null && isActive !== undefined && isActive !== "") {
    where.isActive = isActive === "true";
  }

  const items = await db.specialtyClin.findMany({
    where,
    orderBy: [{ code: "asc" }],
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  if (!body.code || !body.name) {
    return NextResponse.json({ error: "Missing required fields: code, name" }, { status: 400 });
  }

  // Validate facility scope
  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  // Check for duplicate code within organization
  const existing = await db.specialtyClin.findUnique({
    where: { organizationId_code: { organizationId: session.user.organizationId, code: body.code } },
  });
  if (existing) {
    return NextResponse.json({ error: `Clinic with code "${body.code}" already exists` }, { status: 409 });
  }

  const { id: _id, organizationId: _orgId, createdAt: _c, updatedAt: _u, facilityId: _fId, ...createData } = body;

  const item = await db.specialtyClin.create({
    data: {
      ...createData,
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "SPECIALTY_CLINIC_CREATED",
    resourceType: "specialtyClin",
    resourceId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}
