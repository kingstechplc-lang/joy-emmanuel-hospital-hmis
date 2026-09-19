// =====================================================================
// API: /api/notices/[id]/cancel
//   POST — cancel a PUBLISHED or SCHEDULED notice (transition → CANCELLED)
//   Permission: notice.cancel
//   Body: { reason?: string }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NOTICE_CANCEL)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any = {};
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch { /* empty body is fine */ }

  const existing = await db.notice.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Tenant isolation
  if (existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // State machine: only PUBLISHED or SCHEDULED can be cancelled
  if (existing.status !== "PUBLISHED" && existing.status !== "SCHEDULED") {
    return NextResponse.json({
      error: `Cannot cancel a notice in status ${existing.status}`,
      code: "INVALID_STATUS_TRANSITION",
    }, { status: 400 });
  }

  const now = new Date();
  const updated = await db.notice.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      cancelledById: session.user.id,
      updatedById: session.user.id,
      isPinned: false, // unpinned on cancel
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "NOTICE_CANCELLED",
    actionCategory: "OPERATIONS",
    severity: "warning",
    source: "notice_board",
    resourceType: "notice",
    resourceId: id,
    oldValues: { status: existing.status, isPinned: existing.isPinned },
    newValues: { status: "CANCELLED", cancelledAt: now, reason: body.reason || null },
    reason: body.reason || null,
  });

  return NextResponse.json({ item: updated });
}
