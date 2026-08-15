// =====================================================================
// API: /api/departments/[id]
//   GET    — fetch department (with units)
//   PATCH  — update department + manage units (add/edit/delete)
//   DELETE — delete department
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DEPARTMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const dept = await db.department.findUnique({
    where: { id },
    include: {
      facility: { select: { id: true, name: true, code: true } },
      units: { orderBy: { name: "asc" } },
      _count: { select: { encounters: true, staffFacilities: true, wards: true } },
    },
  });

  if (!dept) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Org scope check
  const facility = await db.facility.findUnique({ where: { id: dept.facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ item: dept });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DEPARTMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, code, description, status, action, unit } = body;

  const existing = await db.department.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Org scope
  const facility = await db.facility.findUnique({ where: { id: existing.facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Unit management actions
  if (action === "add_unit") {
    if (!unit?.name || !unit?.code) {
      return NextResponse.json({ error: "Unit name and code required" }, { status: 400 });
    }
    const created = await db.unit.create({
      data: {
        departmentId: id,
        name: unit.name,
        code: unit.code,
        description: unit.description || null,
        status: unit.status || "active",
      },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "UNIT_CREATED",
      resourceType: "unit",
      resourceId: created.id,
      newValues: { departmentId: id, name: unit.name, code: unit.code },
    });
    return NextResponse.json({ item: created }, { status: 201 });
  }

  if (action === "update_unit" && unit?.id) {
    const updated = await db.unit.update({
      where: { id: unit.id },
      data: {
        ...(unit.name ? { name: unit.name } : {}),
        ...(unit.code ? { code: unit.code } : {}),
        ...(typeof unit.description === "string" ? { description: unit.description } : {}),
        ...(unit.status ? { status: unit.status } : {}),
      },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "UNIT_UPDATED",
      resourceType: "unit",
      resourceId: unit.id,
      newValues: unit,
    });
    return NextResponse.json({ item: updated });
  }

  if (action === "delete_unit" && unit?.id) {
    await db.unit.delete({ where: { id: unit.id } });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "UNIT_DELETED",
      resourceType: "unit",
      resourceId: unit.id,
    });
    return NextResponse.json({ ok: true });
  }

  // Default — update department itself
  const updateData: any = {};
  if (typeof name === "string") updateData.name = name;
  if (typeof code === "string") updateData.code = code;
  if (typeof description === "string") updateData.description = description || null;
  if (typeof status === "string") updateData.status = status;

  const updated = await db.department.update({ where: { id }, data: updateData });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "DEPARTMENT_UPDATED",
    resourceType: "department",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code, description: existing.description },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DEPARTMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.department.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await db.department.delete({ where: { id } });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "DEPARTMENT_DELETED",
      resourceType: "department",
      resourceId: id,
      oldValues: { name: existing.name, code: existing.code },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Cannot delete department with associated records. Consider deactivating instead." },
      { status: 400 }
    );
  }
}
