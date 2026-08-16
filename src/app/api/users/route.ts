// =====================================================================
// API: /api/users
//   GET  — list users with search (org-scoped)
//   POST — create user (with bcrypt password hash) and assign roles
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import bcrypt from "bcryptjs";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.USER_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const status = url.searchParams.get("status") || "";

  const where: any = { organizationId: session.user.organizationId };
  if (status && status !== "all") where.status = status;
  if (q) {
    where.OR = [
      { username: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { email: { contains: q } },
    ];
  }

  const users = await db.user.findMany({
    where,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 200,
    include: {
      userRoles: {
        include: {
          role: true,
          facility: { select: { id: true, name: true, code: true } },
        },
      },
      staff: { select: { id: true, staffNumber: true, professionalRole: true } },
    },
  });

  const items = users.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    middleName: u.middleName,
    phone: u.phone,
    status: u.status,
    lastLoginAt: u.lastLoginAt,
    failedLoginAttempts: u.failedLoginAttempts,
    lockedUntil: u.lockedUntil,
    mfaEnabled: u.mfaEnabled,
    createdAt: u.createdAt,
    roles: u.userRoles.map((ur) => ({
      id: ur.role.id,
      code: ur.role.code,
      name: ur.role.name,
      isSystemRole: ur.role.isSystemRole,
      facility: ur.facility
        ? { id: ur.facility.id, name: ur.facility.name, code: ur.facility.code }
        : null,
    })),
    staff: u.staff,
  }));

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.USER_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    username,
    password,
    firstName,
    lastName,
    middleName,
    email,
    phone,
    roles,
  } = body;

  if (!username || !password || !firstName || !lastName || !email) {
    return NextResponse.json(
      { error: "username, password, firstName, lastName, email are required" },
      { status: 400 }
    );
  }

  const orgId = session.user.organizationId;

  // Uniqueness checks
  const existingByUsername = await db.user.findUnique({ where: { username } });
  if (existingByUsername) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }
  const existingByEmail = await db.user.findUnique({ where: { email } });
  if (existingByEmail) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Resolve role IDs and validate they belong to the same org
  let roleAssignments: { roleId: string; facilityId?: string | null; departmentId?: string | null }[] = [];
  if (Array.isArray(roles) && roles.length > 0) {
    const roleIds = roles.map((r: any) => r.roleId).filter(Boolean);
    const validRoles = await db.role.findMany({
      where: { id: { in: roleIds }, organizationId: orgId },
    });
    const validRoleIds = new Set(validRoles.map((r) => r.id));
    roleAssignments = roles
      .filter((r: any) => validRoleIds.has(r.roleId))
      .map((r: any) => ({
        roleId: r.roleId,
        facilityId: r.facilityId || null,
        departmentId: r.departmentId || null,
      }));
  }

  try {
    const user = await db.user.create({
      data: {
        organizationId: orgId,
        username,
        email,
        passwordHash,
        firstName,
        middleName: middleName || null,
        lastName,
        phone: phone || null,
        status: "active",
        passwordChangedAt: new Date(),
        ...(roleAssignments.length > 0
          ? {
              userRoles: {
                create: roleAssignments,
              },
            }
          : {}),
      },
      include: { userRoles: { include: { role: true } } },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: orgId,
      facilityId: session.user.facilityId || undefined,
      action: "USER_CREATED",
      resourceType: "user",
      resourceId: user.id,
      newValues: {
        username,
        email,
        firstName,
        lastName,
        roles: roleAssignments.map((r) => r.roleId),
      },
    });

    return NextResponse.json(
      {
        item: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          status: user.status,
        },
      },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create user" }, { status: 400 });
  }
}
