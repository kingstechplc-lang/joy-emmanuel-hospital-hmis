// =====================================================================
// API: /api/users/assignable
//   GET — lightweight list of users that can be assigned tasks/patients
//
// Unlike /api/users (which requires USER_VIEW permission), this endpoint
// is accessible to anyone with task.assign or staff.manage permission.
// Returns only the minimum fields needed for assignment dropdowns.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Allow if user can assign tasks OR manage staff OR view users
  const canAccess =
    hasPermission(session, PERMISSIONS.TASK_ASSIGN) ||
    hasPermission(session, PERMISSIONS.TASK_COMPLETE) ||
    hasPermission(session, PERMISSIONS.STAFF_VIEW) ||
    hasPermission(session, PERMISSIONS.STAFF_MANAGE) ||
    hasPermission(session, PERMISSIONS.USER_VIEW);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const facilityId = url.searchParams.get("facilityId");

  // Scope to user's org
  const where: any = {
    organizationId: session.user.organizationId,
    status: "active",
  };

  if (q) {
    where.OR = [
      { username: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { email: { contains: q } },
    ];
  }

  // If facilityId is provided, scope to users assigned to that facility (via user_roles or staff_facilities)
  if (facilityId) {
    where.OR = [
      ...(where.OR || []),
      { userRoles: { some: { facilityId } } },
      { staff: { staffFacilities: { some: { facilityId } } } },
    ];
  }

  const users = await db.user.findMany({
    where,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 500,
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      middleName: true,
      email: true,
      userRoles: {
        include: {
          role: { select: { code: true, name: true } },
        },
        take: 3,
      },
      staff: {
        select: {
          staffNumber: true,
          professionalRole: true,
        },
      },
    },
  });

  const items = users.map((u) => ({
    id: u.id,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    middleName: u.middleName,
    name: `${u.firstName} ${u.lastName}`.trim(),
    initials: `${u.firstName?.[0] || ""}${u.lastName?.[0] || ""}`.toUpperCase(),
    email: u.email,
    professionalRole: u.staff?.professionalRole || null,
    staffNumber: u.staff?.staffNumber || null,
    roles: u.userRoles.map((ur) => ur.role.code),
    // secondary text shown in dropdown
    secondary: u.staff?.professionalRole || u.userRoles.map((ur) => ur.role.code).join(", ") || u.username,
  }));

  return NextResponse.json({ items, count: items.length });
}
