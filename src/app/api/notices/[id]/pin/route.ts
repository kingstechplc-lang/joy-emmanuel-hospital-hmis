// =====================================================================
// API: /api/notices/[id]/pin
//   POST — pin or unpin a notice (toggle, or pass { isPinned: bool })
//   Permission: notice.pin
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
  if (!hasPermission(session, PERMISSIONS.NOTICE_PIN)) {
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

  // Toggle: if body.isPinned is provided, use it; else toggle current state
  const newPinned = typeof body.isPinned === "boolean" ? body.isPinned : !existing.isPinned;

  // Can only pin PUBLISHED notices
  if (newPinned && existing.status !== "PUBLISHED") {
    return NextResponse.json({
      error: `Cannot pin a notice in status ${existing.status}`,
    }, { status: 400 });
  }

  const updated = await db.notice.update({
    where: { id },
    data: { isPinned: newPinned, updatedById: session.user.id },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: newPinned ? "NOTICE_PINNED" : "NOTICE_UNPINNED",
    actionCategory: "OPERATIONS",
    severity: "notice",
    source: "notice_board",
    resourceType: "notice",
    resourceId: id,
    oldValues: { isPinned: existing.isPinned },
    newValues: { isPinned: newPinned },
  });

  return NextResponse.json({ item: updated });
}
