// =====================================================================
// API: /api/roles
//   GET  — list roles for the current organization
//   POST — create new role (with optional permission codes)
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
  if (!hasPermission(session, PERMISSIONS.ROLE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const includeSystem = (url.searchParams.get("includeSystem") || "true") === "true";

  const where: any = { organizationId: session.user.organizationId };
  if (!includeSystem) where.isSystemRole = false;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { code: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const roles = await db.role.findMany({
    where,
    orderBy: [{ isSystemRole: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { permissions: true, userRoles: true } },
      permissions: { include: { permission: true } },
    },
  });

  const items = roles.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    description: r.description,
    isSystemRole: r.isSystemRole,
    permissionsCount: r._count.permissions,
    usersCount: r._count.userRoles,
    permissions: r.permissions.map((rp) => ({
      id: rp.permission.id,
      code: rp.permission.code,
      name: rp.permission.name,
      module: rp.permission.module,
    })),
  }));

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ROLE_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, code, description, permissionCodes } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  }

  const orgId = session.user.organizationId;

  const existing = await db.role.findUnique({
    where: { organizationId_code: { organizationId: orgId, code } },
  });
  if (existing) {
    return NextResponse.json({ error: "Role with this code already exists" }, { status: 409 });
  }

  // Resolve permission IDs by codes
  let permConnect: { id: string }[] = [];
  if (Array.isArray(permissionCodes) && permissionCodes.length > 0) {
    const perms = await db.permission.findMany({ where: { code: { in: permissionCodes } } });
    permConnect = perms.map((p) => ({ id: p.id }));
  }

  const role = await db.role.create({
    data: {
      organizationId: orgId,
      name,
      code,
      description: description || null,
      isSystemRole: false,
      ...(permConnect.length > 0
        ? { permissions: { create: permConnect.map((p) => ({ permissionId: p.id })) } }
        : {}),
    },
    include: { permissions: { include: { permission: true } } },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: orgId,
    facilityId: session.user.facilityId || undefined,
    action: "ROLE_CREATED",
    resourceType: "role",
    resourceId: role.id,
    newValues: { name, code, description, permissionCodes: permissionCodes || [] },
  });

  return NextResponse.json({ item: role }, { status: 201 });
}
