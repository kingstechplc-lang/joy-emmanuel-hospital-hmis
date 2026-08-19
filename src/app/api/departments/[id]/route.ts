// =====================================================================
// API: /api/departments/[id]
//   GET    — fetch department (with units, services, staff)
//   PATCH  — update department + manage units + archive/restore
//   DELETE — soft-delete (archive) instead of hard delete
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
  if (!hasPermission(session, PERMISSIONS.DEPARTMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const dept = await db.department.findUnique({
    where: { id },
    include: {
      facility: { select: { id: true, name: true, code: true } },
      units: { orderBy: { name: "asc" } },
      services: { select: { id: true, name: true, code: true, defaultPrice: true, status: true } },
      _count: { select: { encounters: true, staffFacilities: true, wards: true } },
    },
  });

  if (!dept) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
  const {
    name, code, description, status, category, headStaffId, location, contactExtension, operatingHours,
    action, unit,
  } = body;

  const existing = await db.department.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const facility = await db.facility.findUnique({ where: { id: existing.facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ─── Unit management actions ───────────────────────────────────
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
        headStaffId: unit.headStaffId || null,
        location: unit.location || null,
        room: unit.room || null,
        operatingHours: unit.operatingHours || null,
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
        ...(unit.headStaffId !== undefined ? { headStaffId: unit.headStaffId || null } : {}),
        ...(unit.location !== undefined ? { location: unit.location || null } : {}),
        ...(unit.room !== undefined ? { room: unit.room || null } : {}),
        ...(unit.operatingHours !== undefined ? { operatingHours: unit.operatingHours || null } : {}),
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
    // Soft-delete: set status to archived
    await db.unit.update({
      where: { id: unit.id },
      data: { status: "archived" },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "UNIT_ARCHIVED",
      resourceType: "unit",
      resourceId: unit.id,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "restore_unit" && unit?.id) {
    // Restore archived unit
    await db.unit.update({
      where: { id: unit.id },
      data: { status: "active" },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "UNIT_RESTORED",
      resourceType: "unit",
      resourceId: unit.id,
    });
    return NextResponse.json({ ok: true });
  }

  // ─── Archive / Restore actions ─────────────────────────────────
  if (action === "archive") {
    const updated = await db.department.update({
      where: { id },
      data: { status: "archived", updatedById: session.user.id },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "DEPARTMENT_ARCHIVED",
      resourceType: "department",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "archived" },
    });
    return NextResponse.json({ item: updated });
  }

  if (action === "restore") {
    const updated = await db.department.update({
      where: { id },
      data: { status: "active", updatedById: session.user.id },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "DEPARTMENT_RESTORED",
      resourceType: "department",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "active" },
    });
    return NextResponse.json({ item: updated });
  }

  // ─── Default: update department fields ─────────────────────────
  const updateData: any = { updatedById: session.user.id };
  if (typeof name === "string") updateData.name = name;
  if (typeof code === "string") updateData.code = code;
  if (typeof description === "string") updateData.description = description || null;
  if (typeof status === "string") updateData.status = status;
  if (typeof category === "string") updateData.category = category;
  if (headStaffId !== undefined) updateData.headStaffId = headStaffId || null;
  if (location !== undefined) updateData.location = location || null;
  if (contactExtension !== undefined) updateData.contactExtension = contactExtension || null;
  if (operatingHours !== undefined) updateData.operatingHours = operatingHours || null;

  const updated = await db.department.update({ where: { id }, data: updateData });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "DEPARTMENT_UPDATED",
    resourceType: "department",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code, category: existing.category },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

// DELETE — soft-delete (archive) instead of hard delete
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DEPARTMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.department.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft-delete: archive instead of delete
  const updated = await db.department.update({
    where: { id },
    data: { status: "archived", updatedById: session.user.id },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "DEPARTMENT_ARCHIVED",
    resourceType: "department",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code, status: existing.status },
    newValues: { status: "archived" },
  });

  return NextResponse.json({ ok: true, item: updated });
}
