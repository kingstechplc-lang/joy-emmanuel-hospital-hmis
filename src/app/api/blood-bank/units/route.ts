// =====================================================================
// API: /api/blood-bank/units
//   GET  — list blood unit records
//   POST — create a new blood unit
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
  if (!hasPermission(session, PERMISSIONS.BLOODBANK_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");
  const status = url.searchParams.get("status");
  const bloodGroup = url.searchParams.get("bloodGroup");
  const componentType = url.searchParams.get("componentType");

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
  if (status && status !== "all") where.status = status;
  if (bloodGroup && bloodGroup !== "all") where.bloodGroup = bloodGroup;
  if (componentType && componentType !== "all") where.componentType = componentType;
  if (search) {
    where.OR = [{ unitNumber: { contains: search, mode: "insensitive" } }, { bloodGroup: { contains: search, mode: "insensitive" } }];
  }

  const items = await db.bloodUnit.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BLOODBANK_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  if (!donorId || !bloodGroup || !expiryDate) {
    return NextResponse.json({ error: "Missing required fields: donorId, bloodGroup, expiryDate" }, { status: 400 });
  }

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }
  const year = new Date().getFullYear();
  const count = await db.bloodUnit.count({ where: { organizationId: session.user.organizationId } });
  const unitNumber = `BU-${year}-${String(count + 1).padStart(6, "0")}`;

  const item = await db.bloodUnit.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      unitNumber,
      ...body,
      facilityId: resolvedFacilityId,
      organizationId: session.user.organizationId,
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "BLOOD_UNIT_CREATED",
    resourceType: "bloodUnit",
    resourceId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}
