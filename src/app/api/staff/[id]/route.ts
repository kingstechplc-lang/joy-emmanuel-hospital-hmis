// =====================================================================
// API: /api/staff/[id]
//   GET   — fetch a single staff record (with user info, facilities)
//   PATCH — update staff info + user info; manage facility links
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
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const staff = await db.staff.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          status: true,
          lastLoginAt: true,
        },
      },
      staffFacilities: {
        include: {
          facility: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
        },
      },
      shifts: { orderBy: { shiftDate: "desc" }, take: 10 },
      leaves: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!staff) return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  // Org scope check
  const user = await db.user.findUnique({ where: { id: staff.userId }, select: { organizationId: true } });
  if (!user || user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  return NextResponse.json({ item: staff });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const {
    firstName,
    lastName,
    middleName,
    email,
    phone,
    professionalRole,
    professionalRegistrationNumber,
    employmentType,
    employmentStatus,
    hireDate,
    terminationDate,
    userEmail,
    userPhone,
    action,
    facilityId,
    departmentId,
    position,
    isPrimary,
  } = body;

  const existing = await db.staff.findUnique({ where: { id }, include: { user: true } });
  if (!existing) return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  if (existing.user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  // Disable / enable shortcut
  if (action === "disable" || action === "enable") {
    const newStatus = action === "disable" ? "disabled" : "active";
    await db.user.update({
      where: { id: existing.userId },
      data: { status: newStatus },
    });
    if (action === "disable") {
      await db.staff.update({
        where: { id },
        data: { employmentStatus: "terminated", terminationDate: new Date() },
      });
    } else {
      await db.staff.update({
        where: { id },
        data: { employmentStatus: "active", terminationDate: null },
      });
    }
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: session.user.facilityId || undefined,
      action: action === "disable" ? "STAFF_DISABLED" : "STAFF_ENABLED",
      resourceType: "staff",
      resourceId: id,
      oldValues: { employmentStatus: existing.employmentStatus },
      newValues: { employmentStatus: action === "disable" ? "terminated" : "active" },
    });
    return NextResponse.json({ ok: true });
  }

  // Add facility link
  if (action === "add_facility" && facilityId) {
    const existingLink = await db.staffFacility.findUnique({
      where: { staffId_facilityId: { staffId: id, facilityId } },
    });
    if (existingLink) {
      return NextResponse.json({ error: "Staff already linked to this facility" }, { status: 409 });
    }
    const link = await db.staffFacility.create({
      data: {
        staffId: id,
        facilityId,
        departmentId: departmentId || null,
        position: position || null,
        isPrimary: isPrimary || false,
        status: "active",
        startDate: new Date(),
      },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId,
      action: "STAFF_FACILITY_ADDED",
      resourceType: "staff_facility",
      resourceId: link.id,
      newValues: { staffId: id, facilityId, departmentId, position },
    });
    return NextResponse.json({ item: link }, { status: 201 });
  }

  // Default — update staff + user info
  const staffUpdate: any = {};
  if (typeof firstName === "string") staffUpdate.firstName = firstName;
  if (typeof middleName === "string") staffUpdate.middleName = middleName || null;
  if (typeof lastName === "string") staffUpdate.lastName = lastName;
  if (typeof phone === "string") staffUpdate.phone = phone || null;
  if (typeof email === "string") staffUpdate.email = email;
  if (typeof professionalRole === "string") staffUpdate.professionalRole = professionalRole || null;
  if (typeof professionalRegistrationNumber === "string") staffUpdate.professionalRegistrationNumber = professionalRegistrationNumber || null;
  if (typeof employmentType === "string") staffUpdate.employmentType = employmentType;
  if (typeof employmentStatus === "string") staffUpdate.employmentStatus = employmentStatus;
  if (hireDate) staffUpdate.hireDate = new Date(hireDate);
  if (terminationDate) staffUpdate.terminationDate = new Date(terminationDate);

  if (Object.keys(staffUpdate).length > 0) {
    await db.staff.update({ where: { id }, data: staffUpdate });
  }

  // Update user info too
  const userUpdate: any = {};
  if (typeof firstName === "string") userUpdate.firstName = firstName;
  if (typeof middleName === "string") userUpdate.middleName = middleName || null;
  if (typeof lastName === "string") userUpdate.lastName = lastName;
  if (typeof userEmail === "string") userUpdate.email = userEmail;
  if (typeof userPhone === "string") userUpdate.phone = userPhone || null;
  if (Object.keys(userUpdate).length > 0) {
    if (userUpdate.email && userUpdate.email !== existing.user.email) {
      const emailOwner = await db.user.findUnique({ where: { email: userUpdate.email } });
      if (emailOwner && emailOwner.id !== existing.userId) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      }
    }
    await db.user.update({ where: { id: existing.userId }, data: userUpdate });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "STAFF_UPDATED",
    resourceType: "staff",
    resourceId: id,
    oldValues: {
      firstName: existing.firstName,
      lastName: existing.lastName,
      professionalRole: existing.professionalRole,
      employmentStatus: existing.employmentStatus,
    },
    newValues: staffUpdate,
  });

  const updated = await db.staff.findUnique({
    where: { id },
    include: { user: { select: { id: true, username: true, email: true, phone: true, status: true } } },
  });
  return NextResponse.json({ item: updated });
}
