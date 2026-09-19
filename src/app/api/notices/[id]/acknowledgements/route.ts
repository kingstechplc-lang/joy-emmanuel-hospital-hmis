// =====================================================================
// API: /api/notices/[id]/acknowledgements
//   GET — acknowledgement summary for a notice
//   Permission: notice.acknowledgement.view (admins/publishers)
//   Returns: { total, acknowledged, pending, percentage, audience[] }
//
//   The audience list contains ALL users in the target scope with their
//   ack status. For large org-wide notices, the audience can be huge —
//   the response is paginated via ?page & ?pageSize, but the summary
//   counts (total, acknowledged, pending, percentage) are always full.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NOTICE_ACK_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const notice = await db.notice.findUnique({
    where: { id },
    include: { targets: true },
  });
  if (!notice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Tenant isolation
  if (notice.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Build the audience WHERE clause based on targeting
  // A user is in the audience if they match ANY of the target rows
  const audienceClauses: any[] = [{ organizationId: notice.organizationId, status: "active" }];

  // We need to resolve which users are in scope based on the targets
  // For FACILITY/DEPARTMENT/USER targets → match those ids directly
  // For ROLE target → match users with that role
  // For ORGANIZATION target → match all users in the org
  const facilityIds = notice.targets.filter(t => t.targetType === "FACILITY" && t.targetId !== "*").map(t => t.targetId);
  const departmentIds = notice.targets.filter(t => t.targetType === "DEPARTMENT" && t.targetId !== "*").map(t => t.targetId);
  const userIds = notice.targets.filter(t => t.targetType === "USER").map(t => t.targetId);
  const roleIds = notice.targets.filter(t => t.targetType === "ROLE" && t.targetId !== "*").map(t => t.targetId);
  const orgScoped = notice.targets.some(t => t.targetType === "ORGANIZATION");
  const facilityWildcard = notice.targets.some(t => t.targetType === "FACILITY" && t.targetId === "*");
  const deptWildcard = notice.targets.some(t => t.targetType === "DEPARTMENT" && t.targetId === "*");
  const roleWildcard = notice.targets.some(t => t.targetType === "ROLE" && t.targetId === "*");

  // Resolve facility "all in scope" — if notice has facilityId, that facility
  // else all facilities in the org
  let resolvedFacilityIds = facilityIds;
  if (facilityWildcard) {
    if (notice.facilityId) {
      resolvedFacilityIds.push(notice.facilityId);
    } else {
      // All facilities in org
      const allFacs = await db.facility.findMany({ where: { organizationId: notice.organizationId }, select: { id: true } });
      resolvedFacilityIds.push(...allFacs.map(f => f.id));
    }
    orgScoped; // suppress unused
  }

  // Resolve department "all in scope" — all departments in the notice's facility
  let resolvedDeptIds = departmentIds;
  if (deptWildcard) {
    const facId = notice.facilityId;
    if (facId) {
      const allDeps = await db.department.findMany({ where: { facilityId: facId }, select: { id: true } });
      resolvedDeptIds.push(...allDeps.map(d => d.id));
    }
  }

  // Build the where clause for audience
  const where: any = { organizationId: notice.organizationId, status: "active" };

  // Match ANY of: facility, department, role, user, or org-wide
  const orClauses: any[] = [];
  if (resolvedFacilityIds.length > 0) orClauses.push({ facilityId: { in: resolvedFacilityIds } });
  if (resolvedDeptIds.length > 0) orClauses.push({ departmentId: { in: resolvedDeptIds } });
  if (userIds.length > 0) orClauses.push({ id: { in: userIds } });
  if (orgScoped || roleWildcard) {
    // org-wide → all active users in org
  }
  if (roleIds.length > 0 || roleWildcard) {
    // Match by role — stored as JSON array on User.staffRoleId or similar
    // For now, match by staffRole field if present
    if (roleIds.length > 0) {
      // We need to look up users by role name. The simplest approach: use
      // userRoles join. But to keep this query simple and avoid N+1, we'll
      // fetch all matching users in one query.
      const roleUsers = await db.userRole.findMany({
        where: { roleId: { in: roleIds } },
        select: { userId: true },
      });
      orClauses.push({ id: { in: roleUsers.map(r => r.userId) } });
    }
  }

  if (orClauses.length > 0) {
    where.OR = orClauses;
  } else if (!orgScoped) {
    // No target rows matched anything specific and not org-scoped → empty audience
    return NextResponse.json({
      total: 0, acknowledged: 0, pending: 0, percentage: 0,
      audience: [],
    });
  }

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "25", 10)));

  // Count total audience + acknowledged count
  const [total, acks] = await Promise.all([
    db.user.count({ where }),
    db.noticeAcknowledgement.findMany({
      where: { noticeId: id },
      select: { userId: true, acknowledgedAt: true },
    }),
  ]);
  const ackedUserIds = new Set(acks.map(a => a.userId));
  const acknowledged = acks.length;
  const pending = Math.max(0, total - acknowledged);
  const percentage = total > 0 ? Math.round((acknowledged / total) * 1000) / 10 : 0;

  // Fetch audience with ack status (paginated).
  // User.facilityId/departmentId live on the related Staff model — we
  // resolve them via the staff relation + a separate name lookup.
  const audienceUsers = await db.user.findMany({
    where,
    select: {
      id: true, firstName: true, lastName: true, email: true,
      staff: { select: { facilityId: true, departmentId: true } },
    },
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  // Resolve facility + department names for the page
  const facIds = Array.from(new Set(audienceUsers.map(u => u.staff?.facilityId).filter(Boolean) as string[]));
  const depIds = Array.from(new Set(audienceUsers.map(u => u.staff?.departmentId).filter(Boolean) as string[]));
  const [facs, deps] = await Promise.all([
    facIds.length ? db.facility.findMany({ where: { id: { in: facIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    depIds.length ? db.department.findMany({ where: { id: { in: depIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const facMap = new Map(facs.map((f) => [f.id, f.name] as const));
  const depMap = new Map(deps.map((d) => [d.id, d.name] as const));

  const audience = audienceUsers.map((u) => ({
    id: u.id,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email,
    facility: (u.staff?.facilityId && facMap.get(u.staff.facilityId)) || null,
    department: (u.staff?.departmentId && depMap.get(u.staff.departmentId)) || null,
    acknowledged: ackedUserIds.has(u.id),
    acknowledgedAt: acks.find((a) => a.userId === u.id)?.acknowledgedAt || null,
  }));

  return NextResponse.json({
    total,
    acknowledged,
    pending,
    percentage,
    audience,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
