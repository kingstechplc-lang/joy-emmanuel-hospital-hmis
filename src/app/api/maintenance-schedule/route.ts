// =====================================================================
// API: /api/maintenance-schedule
//   GET  — list maintenance schedules
//   POST — create maintenance schedule
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
  if (!hasPermission(session, PERMISSIONS.SUPPORT_SERVICES_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) where.facilityId = facilityId;
  else where.facilityId = { in: orgFacilityIds };
  if (status && status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await db.maintenanceSchedule.findMany({
    where,
    orderBy: { scheduledDate: "asc" },
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SUPPORT_SERVICES_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, maintenanceType, scheduledDate } = body;
  if (!title || !scheduledDate) {
    return NextResponse.json({ error: "title and scheduledDate are required" }, { status: 400 });
  }

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  // Convert date strings to Date objects + strip unknown fields
  const { id: _id, organizationId: _org, createdAt: _c, updatedAt: _u, createdById: _cb, location: _loc, ...createData } = body;
  if (createData.scheduledDate) {
    try { createData.scheduledDate = new Date(createData.scheduledDate); } catch {}
  }
  if (createData.nextDueAt) {
    try { createData.nextDueAt = new Date(createData.nextDueAt); } catch {}
  }
  if (createData.completedAt) {
    try { createData.completedAt = new Date(createData.completedAt); } catch {}
  }

  const item = await db.maintenanceSchedule.create({
    data: {
      ...createData,
      facilityId: resolvedFacilityId,
      organizationId: session.user.organizationId,
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "MAINTENANCE_SCHEDULE_CREATED",
    resourceType: "maintenance_schedule",
    resourceId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}
