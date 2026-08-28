// =====================================================================
// API: /api/rosters
//   GET  — list rosters (filter by facility, department, status, date range)
//   POST — create a new roster (draft status)
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
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const departmentId = url.searchParams.get("departmentId");
  const status = url.searchParams.get("status");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { facilityId: { in: orgFacilityIds } };
  if (facilityId) where.facilityId = facilityId;
  if (departmentId) where.departmentId = departmentId;
  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.startDate = {};
    if (dateFrom) where.startDate.gte = new Date(dateFrom);
    if (dateTo) where.startDate.lte = new Date(dateTo);
  }

  const items = await db.roster.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      _count: { select: { shifts: true, versions: true } },
    },
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ROSTER_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { name, facilityId, departmentId, startDate, endDate, notes } = body;

  if (!name || !facilityId || !startDate || !endDate) {
    return NextResponse.json({ error: "name, facilityId, startDate, endDate are required" }, { status: 400 });
  }

  const facility = await db.facility.findUnique({ where: { id: facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  }

  const roster = await db.roster.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId,
      departmentId: departmentId || null,
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: "draft",
      notes,
    },
  });

  // Create initial version
  await db.rosterVersion.create({
    data: {
      rosterId: roster.id,
      versionNumber: 1,
      snapshot: JSON.stringify({ assignments: [] }),
      changedById: session.user.id,
      changeReason: "Initial draft",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "ROSTER_CREATED",
    resourceType: "roster",
    resourceId: roster.id,
    newValues: { name, facilityId, startDate, endDate },
  });

  return NextResponse.json({ item: roster }, { status: 201 });
}
