// =====================================================================
// API: /api/users/[id]
//   GET    — fetch a single user (with roles)
//   PATCH  — update user info / change roles / disable / reset password / unlock
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import bcrypt from "bcryptjs";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.USER_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    include: {
      userRoles: {
        include: {
          role: true,
          facility: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
        },
      },
      staff: true,
    },
  });

  if (!user || user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    item: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName,
      phone: user.phone,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt,
      roles: user.userRoles.map((ur) => ({
        id: ur.id,
        roleId: ur.roleId,
        role: ur.role,
        facilityId: ur.facilityId,
        facility: ur.facility,
        departmentId: ur.departmentId,
        department: ur.department,
      })),
      staff: user.staff,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.USER_EDIT) && !hasPermission(session, PERMISSIONS.USER_DISABLE)) {
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
  const {
    firstName,
    middleName,
    lastName,
    email,
    phone,
    status,
    roles,
    action,
    newPassword,
    forceChange,
  } = body;

  const existing = await db.user.findUnique({ where: { id }, include: { userRoles: true } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Action-based shortcuts
  if (action === "disable") {
    if (!hasPermission(session, PERMISSIONS.USER_DISABLE)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await db.user.update({ where: { id }, data: { status: "disabled" } });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: session.user.facilityId || undefined,
      action: "USER_DISABLED",
      resourceType: "user",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "disabled" },
    });
    return NextResponse.json({ item: updated });
  }

  if (action === "enable") {
    const updated = await db.user.update({
      where: { id },
      data: { status: "active", failedLoginAttempts: 0, lockedUntil: null },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: session.user.facilityId || undefined,
      action: "USER_ENABLED",
      resourceType: "user",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "active" },
    });
    return NextResponse.json({ item: updated });
  }

  if (action === "unlock") {
    const updated = await db.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: session.user.facilityId || undefined,
      action: "USER_UNLOCKED",
      resourceType: "user",
      resourceId: id,
      oldValues: { failedLoginAttempts: existing.failedLoginAttempts, lockedUntil: existing.lockedUntil },
      newValues: { failedLoginAttempts: 0, lockedUntil: null },
    });
    return NextResponse.json({ item: updated });
  }

  if (action === "reset_password") {
    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await db.user.update({
      where: { id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        mustChangePassword: forceChange === true,
      },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: session.user.facilityId || undefined,
      action: "USER_PASSWORD_RESET",
      resourceType: "user",
      resourceId: id,
      newValues: { forceChange: forceChange === true },
    });
    return NextResponse.json({ item: { id: updated.id } });
  }

  // Generic update — info + roles
  const updateData: any = {};
  if (typeof firstName === "string") updateData.firstName = firstName;
  if (typeof middleName === "string") updateData.middleName = middleName || null;
  if (typeof lastName === "string") updateData.lastName = lastName;
  if (typeof phone === "string") updateData.phone = phone || null;
  if (typeof email === "string") {
    // Check email conflict
    if (email !== existing.email) {
      const emailOwner = await db.user.findUnique({ where: { email } });
      if (emailOwner && emailOwner.id !== id) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      }
    }
    updateData.email = email;
  }
  if (typeof status === "string") {
    if (!hasPermission(session, PERMISSIONS.USER_DISABLE) && status !== existing.status) {
      return NextResponse.json({ error: "Cannot change user status" }, { status: 403 });
    }
    updateData.status = status;
  }

  // Update info first
  if (Object.keys(updateData).length > 0) {
    await db.user.update({ where: { id }, data: updateData });
  }

  // Manage roles (full replace)
  let rolesUpdated = false;
  if (Array.isArray(roles)) {
    rolesUpdated = true;
    await db.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      if (roles.length > 0) {
        const roleIds = roles.map((r: any) => r.roleId).filter(Boolean);
        const validRoles = await tx.role.findMany({
          where: { id: { in: roleIds }, organizationId: session.user.organizationId },
        });
        const validIds = new Set(validRoles.map((r) => r.id));
        const toCreate = roles.filter((r: any) => validIds.has(r.roleId));
        if (toCreate.length > 0) {
          await tx.userRole.createMany({
            data: toCreate.map((r: any) => ({
              userId: id,
              roleId: r.roleId,
              facilityId: r.facilityId || null,
              departmentId: r.departmentId || null,
            })),
          });
        }
      }
    });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: rolesUpdated ? "USER_UPDATED_WITH_ROLES" : "USER_UPDATED",
    resourceType: "user",
    resourceId: id,
    oldValues: {
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      phone: existing.phone,
      status: existing.status,
    },
    newValues: updateData,
  });

  const updated = await db.user.findUnique({
    where: { id },
    include: { userRoles: { include: { role: true } } },
  });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Soft-delete via disable
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.USER_DISABLE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await db.user.update({ where: { id }, data: { status: "disabled" } });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "USER_DISABLED",
    resourceType: "user",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}
