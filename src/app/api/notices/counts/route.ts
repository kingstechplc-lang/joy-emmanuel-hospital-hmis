// =====================================================================
// API: /api/notices/counts
//   GET — fast counts for the global notice indicator + dashboard widget
//   Returns: { unread, pendingAck, critical, pinned, totalActive }
//
//   This is a lightweight endpoint intended to be polled every 15-30s
//   by the app shell badge. Heavier aggregation (calls-by-tool etc.)
//   belongs in the main /api/notices list endpoint.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NOTICE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();

  // Build the visibility OR clause for this user
  const targetClauses: any[] = [
    { targets: { some: { targetType: "ORGANIZATION", targetId: { in: [session.user.organizationId, "*"] } } } },
  ];
  if (session.user.facilityId) {
    targetClauses.push({ targets: { some: { targetType: "FACILITY", targetId: { in: [session.user.facilityId, "*"] } } } });
  }
  if (session.user.departmentId) {
    targetClauses.push({ targets: { some: { targetType: "DEPARTMENT", targetId: { in: [session.user.departmentId, "*"] } } } });
  }
  if (session.user.roles?.length) {
    targetClauses.push({ targets: { some: { targetType: "ROLE", targetId: { in: [...session.user.roles, "*"] } } } });
  }
  targetClauses.push({ targets: { some: { targetType: "USER", targetId: session.user.id } } });

  const baseWhere = {
    organizationId: session.user.organizationId,
    status: "PUBLISHED" as const,
    publishAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    AND: [{ OR: targetClauses }],
  };

  // Total active notices visible to user
  const totalActive = await db.notice.count({ where: baseWhere });

  // Pinned notices
  const pinned = await db.notice.count({ where: { ...baseWhere, isPinned: true } });

  // Critical notices (CRITICAL priority)
  const critical = await db.notice.count({ where: { ...baseWhere, priority: "CRITICAL" } });

  // All visible notice ids (for read/ack cross-reference)
  const visibleNotices = await db.notice.findMany({
    where: baseWhere,
    select: { id: true, requiresAcknowledgement: true },
  });
  const visibleIds = visibleNotices.map(n => n.id);
  const ackRequiredIds = visibleNotices.filter(n => n.requiresAcknowledgement).map(n => n.id);

  // Unread count — notices in visibleIds that the user has NOT read
  const readIds = await db.noticeRead.findMany({
    where: { userId: session.user.id, noticeId: { in: visibleIds } },
    select: { noticeId: true },
  });
  const readIdSet = new Set(readIds.map(r => r.noticeId));
  const unread = visibleIds.filter(id => !readIdSet.has(id)).length;

  // Pending acknowledgement — notices requiring ack that the user hasn't acked
  const ackedIds = await db.noticeAcknowledgement.findMany({
    where: { userId: session.user.id, noticeId: { in: ackRequiredIds } },
    select: { noticeId: true },
  });
  const ackedIdSet = new Set(ackedIds.map(a => a.noticeId));
  const pendingAck = ackRequiredIds.filter(id => !ackedIdSet.has(id)).length;

  return NextResponse.json({
    totalActive,
    unread,
    pendingAck,
    critical,
    pinned,
    generatedAt: now.toISOString(),
  });
}
