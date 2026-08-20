// =====================================================================
// API: /api/departments
//   GET  — list departments filtered by facilityId, category, status
//   POST — create department with new fields
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
  if (!hasPermission(session, PERMISSIONS.DEPARTMENT_MANAGE) && !hasPermission(session, PERMISSIONS.FACILITY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const q = url.searchParams.get("q") || "";
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status");
  const includeArchived = url.searchParams.get("includeArchived") === "true";

  // Scope to user's org
  const facilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const facilityIds = facilities.map((f) => f.id);

  const where: any = {};
  if (facilityId && facilityIds.includes(facilityId)) {
    where.facilityId = facilityId;
  } else {
    where.facilityId = { in: facilityIds };
  }
  if (q) {
    where.OR = [{ name: { contains: q } }, { code: { contains: q } }, { description: { contains: q } }];
  }
  if (category && category !== "all") where.category = category;
  if (status && status !== "all") {
    where.status = status;
  } else if (!includeArchived) {
    where.status = { not: "archived" };
  }

  const departments = await db.department.findMany({
    where,
    orderBy: [{ facilityId: "asc" }, { name: "asc" }],
    include: {
      facility: { select: { id: true, name: true, code: true } },
      _count: { select: { units: true, encounters: true, staffFacilities: true, services: true } },
    },
  });

  const items = departments.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    category: d.category,
    description: d.description,
    headStaffId: d.headStaffId,
    location: d.location,
    contactExtension: d.contactExtension,
    operatingHours: d.operatingHours,
    status: d.status,
    facilityId: d.facilityId,
    facility: d.facility,
    unitsCount: d._count.units,
    encountersCount: d._count.encounters,
    staffCount: d._count.staffFacilities,
    servicesCount: d._count.services,
  }));

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DEPARTMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const {
    name, code, description, facilityId, status,
    category, headStaffId, location, contactExtension, operatingHours,
  } = body;

  if (!name || !code || !facilityId) {
    return NextResponse.json({ error: "name, code, facilityId are required" }, { status: 400 });
  }

  const facility = await db.facility.findUnique({ where: { id: facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Facility not found in your organization" }, { status: 404 });
  }

  try {
    const dept = await db.department.create({
      data: {
        facilityId,
        name,
        code,
        category: category || "Clinical",
        description: description || null,
        headStaffId: headStaffId || null,
        location: location || null,
        contactExtension: contactExtension || null,
        operatingHours: operatingHours || null,
        status: status || "active",
        createdById: session.user.id,
        updatedById: session.user.id,
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId,
      action: "DEPARTMENT_CREATED",
      resourceType: "department",
      resourceId: dept.id,
      newValues: { name, code, category, facilityId },
    });

    return NextResponse.json({ item: dept }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create department" }, { status: 400 });
  }
}
