// =====================================================================
// API: /api/departments
//   GET  — list departments filtered by facilityId
//   POST — create department
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DEPARTMENT_MANAGE) && !hasPermission(session, PERMISSIONS.FACILITY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const q = url.searchParams.get("q") || "";

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (q) {
    where.OR = [{ name: { contains: q } }, { code: { contains: q } }, { description: { contains: q } }];
  }

  // Scope to user's org
  const facilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const facilityIds = facilities.map((f) => f.id);
  if (facilityId) {
    if (!facilityIds.includes(facilityId)) {
      return NextResponse.json({ items: [] });
    }
  } else {
    where.facilityId = { in: facilityIds };
  }

  const departments = await db.department.findMany({
    where,
    orderBy: [{ facilityId: "asc" }, { name: "asc" }],
    include: {
      facility: { select: { id: true, name: true, code: true } },
      _count: { select: { units: true, encounters: true, staffFacilities: true } },
    },
  });

  const items = departments.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    description: d.description,
    status: d.status,
    facilityId: d.facilityId,
    facility: d.facility,
    unitsCount: d._count.units,
    encountersCount: d._count.encounters,
    staffCount: d._count.staffFacilities,
  }));

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DEPARTMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, code, description, facilityId, status } = body;

  if (!name || !code || !facilityId) {
    return NextResponse.json({ error: "name, code, facilityId are required" }, { status: 400 });
  }

  // Verify facility belongs to user's org
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
        description: description || null,
        status: status || "active",
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId,
      action: "DEPARTMENT_CREATED",
      resourceType: "department",
      resourceId: dept.id,
      newValues: { name, code, description, facilityId },
    });

    return NextResponse.json({ item: dept }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create department" }, { status: 400 });
  }
}
