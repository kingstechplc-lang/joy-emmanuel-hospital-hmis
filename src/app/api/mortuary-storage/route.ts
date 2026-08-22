// =====================================================================
// API: /api/mortuary-storage
//   GET  — list storage units (filter by facility, status)
//   POST — create storage unit
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
  if (!hasPermission(session, PERMISSIONS.MORTUARY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");

  const orgFacilities = await db.facility.findMany({ where: { organizationId: session.user.organizationId }, select: { id: true } });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) where.facilityId = facilityId;
  else where.facilityId = { in: orgFacilityIds };
  if (status && status !== "all") where.status = status;
  if (search) where.name = { contains: search, mode: "insensitive" };

  const items = await db.mortuaryStorage.findMany({ where, orderBy: { name: "asc" } });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MORTUARY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: any;
  try { const text = await req.text(); body = text ? JSON.parse(text) : {}; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name } = body;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  const { id: _id, organizationId: _org, createdAt: _c, updatedAt: _u, facilityId: _f, ...createData } = body;
  const item = await db.mortuaryStorage.create({
    data: { ...createData, facilityId: resolvedFacilityId, organizationId: session.user.organizationId },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "MORTUARY_STORAGE_CREATED", resourceType: "mortuary_storage", resourceId: item.id });
  return NextResponse.json({ item }, { status: 201 });
}
