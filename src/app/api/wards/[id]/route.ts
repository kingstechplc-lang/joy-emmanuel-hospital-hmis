// =====================================================================
// API: /api/wards/[id]
//   GET    — single ward with rooms and bed stats
//   PATCH  — update ward fields
//   DELETE — soft-delete (status = "inactive")
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
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW) && !hasPermission(session, PERMISSIONS.BED_VIEW) && !hasPermission(session, PERMISSIONS.BED_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const ward = await db.ward.findUnique({
    where: { id },
    include: {
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true } },
      rooms: { orderBy: { roomNumber: "asc" } },
      _count: { select: { beds: true } },
    },
  });
  if (!ward) return NextResponse.json({ error: "Ward not found" }, { status: 404 });
  return NextResponse.json({ item: ward });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BED_EDIT) && !hasPermission(session, PERMISSIONS.BED_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden — missing bed.edit permission" }, { status: 403 });
  }
  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const existing = await db.ward.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Ward not found" }, { status: 404 });

  const { name, code, wardType, genderPolicy, capacity, status, departmentId } = body;
  const updateData: any = {};
  if (typeof name === "string") updateData.name = name;
  if (typeof code === "string") updateData.code = code;
  if (typeof wardType === "string") updateData.wardType = wardType;
  if (typeof genderPolicy === "string") updateData.genderPolicy = genderPolicy;
  if (typeof capacity === "number") updateData.capacity = capacity;
  if (typeof status === "string") updateData.status = status;
  if (departmentId !== undefined) updateData.departmentId = departmentId || null;

  // Check code uniqueness if changing
  if (updateData.code && updateData.code !== existing.code) {
    const codeOwner = await db.ward.findFirst({ where: { facilityId: existing.facilityId, code: updateData.code } });
    if (codeOwner && codeOwner.id !== id) {
      return NextResponse.json({ error: "Ward code already in use" }, { status: 409 });
    }
  }

  const updated = await db.ward.update({ where: { id }, data: updateData });
  await auditLog({
    userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId,
    action: "WARD_UPDATED", resourceType: "ward", resourceId: id,
    oldValues: { name: existing.name, code: existing.code, status: existing.status },
    newValues: updateData,
  });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BED_RETIRE) && !hasPermission(session, PERMISSIONS.BED_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden — missing bed.retire permission" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.ward.findUnique({ where: { id }, include: { _count: { select: { beds: true } } } });
  if (!existing) return NextResponse.json({ error: "Ward not found" }, { status: 404 });

  // Check for active bed assignments
  const activeAssignments = await db.bedAssignment.count({
    where: { status: "active", bed: { wardId: id } },
  });
  if (activeAssignments > 0) {
    return NextResponse.json({ error: `Cannot deactivate ward — ${activeAssignments} active bed assignment(s) still exist. Release all patients first.` }, { status: 400 });
  }

  // Soft-delete: set status to inactive
  await db.ward.update({ where: { id }, data: { status: "inactive" } });
  await auditLog({
    userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId,
    action: "WARD_DEACTIVATED", resourceType: "ward", resourceId: id,
    oldValues: { name: existing.name, code: existing.code },
  });
  return NextResponse.json({ ok: true });
}
