// =====================================================================
// API: /api/security
//   GET — security dashboard data:
//         - Quick stats (total users, active users, locked users, break-glass events this week)
//         - Active sessions (users recently logged in)
//         - Failed login attempts (failedLoginAttempts > 0)
//         - Locked accounts (lockedUntil > now)
//         - Recent break-glass events
//         - Sensitive patient access logs
//         - Permission changes (audit logs filtered to action containing "PERMISSION")
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SECURITY_DASHBOARD)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.organizationId;
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsers,
    lockedUsers,
    disabledUsers,
    breakGlassThisWeek,
    recentSessions,
    failedAttempts,
    lockedAccounts,
    recentBreakGlass,
    recentPatientAccess,
    permissionChanges,
  ] = await Promise.all([
    db.user.count({ where: { organizationId: orgId } }),
    db.user.count({ where: { organizationId: orgId, status: "active" } }),
    db.user.count({
      where: {
        organizationId: orgId,
        lockedUntil: { gt: now },
      },
    }),
    db.user.count({ where: { organizationId: orgId, status: "disabled" } }),
    db.breakGlassEvent.count({
      where: { createdAt: { gte: oneWeekAgo } },
    }),
    // Recent sessions (users with lastLoginAt within last 24h)
    db.user.findMany({
      where: { organizationId: orgId, lastLoginAt: { gte: oneDayAgo } },
      orderBy: { lastLoginAt: "desc" },
      take: 15,
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        lastLoginAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        status: true,
        userRoles: { include: { role: { select: { code: true, name: true } } } },
      },
    }),
    // Failed login attempts (any user with failedLoginAttempts > 0)
    db.user.findMany({
      where: { organizationId: orgId, failedLoginAttempts: { gt: 0 } },
      orderBy: { failedLoginAttempts: "desc" },
      take: 15,
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        status: true,
        lastLoginAt: true,
      },
    }),
    // Locked accounts
    db.user.findMany({
      where: { organizationId: orgId, lockedUntil: { gt: now } },
      orderBy: { lockedUntil: "desc" },
      take: 15,
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        status: true,
      },
    }),
    // Recent break-glass events
    db.breakGlassEvent.findMany({
      orderBy: { startedAt: "desc" },
      take: 15,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, username: true } },
        patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } },
        facility: { select: { id: true, name: true, code: true } },
      },
    }),
    // Sensitive patient access logs (recent)
    db.patientAccessLog.findMany({
      orderBy: { accessedAt: "desc" },
      take: 15,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, username: true } },
        patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } },
        facility: { select: { id: true, name: true, code: true } },
      },
    }),
    // Permission changes
    db.auditLog.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { action: { contains: "PERMISSION" } },
          { action: { contains: "ROLE" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, username: true } },
      },
    }),
  ]);

  return NextResponse.json({
    stats: {
      totalUsers,
      activeUsers,
      lockedUsers,
      disabledUsers,
      breakGlassThisWeek,
    },
    recentSessions,
    failedAttempts,
    lockedAccounts,
    recentBreakGlass,
    recentPatientAccess,
    permissionChanges,
  });
}
