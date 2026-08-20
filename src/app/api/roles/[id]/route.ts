// =====================================================================
// API: /api/roles/[id]
//   GET    — fetch a single role (with permissions)
//   PATCH  — update role details + manage permissions (delete all + recreate)
//   DELETE — delete non-system role
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
  if (!hasPermission(session, PERMISSIONS.ROLE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const role = await db.role.findUnique({
    where: { id },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { userRoles: true } },
    },
  });

  if (!role || role.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  return NextResponse.json({ item: role });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ROLE_EDIT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { name, description, permissionCodes, isSystemRole } = body;

  const existing = await db.role.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  const updateData: any = {};
  if (typeof name === "string") updateData.name = name;
  if (typeof description === "string") updateData.description = description;
  if (typeof isSystemRole === "boolean" && hasPermission(session, PERMISSIONS.PERMISSION_ASSIGN)) {
    updateData.isSystemRole = isSystemRole;
  }

  // Manage permissions: delete all + recreate (only when permissionCodes provided)
  const permissionsChanged = Array.isArray(permissionCodes);

  const updated = await db.$transaction(async (tx) => {
    if (permissionsChanged) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissionCodes.length > 0) {
        const perms = await tx.permission.findMany({ where: { code: { in: permissionCodes } } });
        if (perms.length > 0) {
          await tx.rolePermission.createMany({
            data: perms.map((p) => ({ roleId: id, permissionId: p.id })),
          });
        }
      }
    }
    return tx.role.update({ where: { id }, data: updateData, include: { permissions: { include: { permission: true } } } });
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: permissionsChanged ? "PERMISSION_CHANGED" : "ROLE_UPDATED",
    resourceType: "role",
    resourceId: id,
    oldValues: { name: existing.name, description: existing.description },
    newValues: { name, description, permissionCodes: permissionCodes || undefined },
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ROLE_EDIT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.role.findUnique({ where: { id }, include: { _count: { select: { userRoles: true } } } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }
  if (existing.isSystemRole) {
    return NextResponse.json({ error: "System roles cannot be deleted" }, { status: 400 });
  }
  if (existing._count.userRoles > 0) {
    return NextResponse.json({ error: "Cannot delete a role that is assigned to users" }, { status: 400 });
  }

  await db.role.delete({ where: { id } });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "ROLE_DELETED",
    resourceType: "role",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code },
  });

  return NextResponse.json({ ok: true });
}
