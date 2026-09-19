// =====================================================================
// API: /api/notices/[id]/read
//   POST — mark a notice as read by the current user (idempotent)
//   Permission: notice.view + must be in target scope
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

async function userCanSeeNotice(session: any, noticeId: string): Promise<boolean> {
  const targets = await db.noticeTarget.findMany({ where: { noticeId } });
  for (const t of targets) {
    if (t.targetType === "ORGANIZATION" && (t.targetId === session.user.organizationId || t.targetId === "*")) return true;
    if (t.targetType === "FACILITY" && session.user.facilityId && (t.targetId === session.user.facilityId || t.targetId === "*")) return true;
    if (t.targetType === "DEPARTMENT" && session.user.departmentId && (t.targetId === session.user.departmentId || t.targetId === "*")) return true;
    if (t.targetType === "ROLE" && (session.user.roles?.includes(t.targetId) || t.targetId === "*")) return true;
    if (t.targetType === "USER" && t.targetId === session.user.id) return true;
  }
  return false;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NOTICE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const notice = await db.notice.findUnique({ where: { id } });
  if (!notice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Tenant isolation + visibility check
  if (notice.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (notice.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!await userCanSeeNotice(session, id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Idempotent upsert — unique constraint prevents duplicate reads
  const read = await db.noticeRead.upsert({
    where: { noticeId_userId: { noticeId: id, userId: session.user.id } },
    create: { noticeId: id, userId: session.user.id },
    update: {},
  });

  // Audit only on the first read (not on subsequent upsert no-ops)
  if (read && read.readAt && new Date(read.readAt).getTime() > Date.now() - 5000) {
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: notice.facilityId || undefined,
      action: "NOTICE_READ",
      actionCategory: "OPERATIONS",
      severity: "info",
      source: "notice_board",
      resourceType: "notice",
      resourceId: id,
    });
  }

  return NextResponse.json({ success: true });
}
