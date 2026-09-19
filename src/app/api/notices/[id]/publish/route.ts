// =====================================================================
// API: /api/notices/[id]/publish
//   POST — publish a DRAFT or SCHEDULED notice (transition → PUBLISHED)
//   Permission: notice.publish
//   Body: { } (no fields — the notice is published immediately)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NOTICE_PUBLISH)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.notice.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Tenant isolation
  if (existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // State machine: only DRAFT or SCHEDULED can transition to PUBLISHED
  if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
    return NextResponse.json({
      error: `Cannot publish a notice in status ${existing.status}`,
      code: "INVALID_STATUS_TRANSITION",
    }, { status: 400 });
  }

  const now = new Date();
  const updated = await db.notice.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      publishedAt: now,
      publishAt: existing.publishAt || now,
      updatedById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "NOTICE_PUBLISHED",
    actionCategory: "OPERATIONS",
    severity: "notice",
    source: "notice_board",
    resourceType: "notice",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: { status: "PUBLISHED", publishedAt: now },
  });

  return NextResponse.json({ item: updated });
}
