// =====================================================================
// API: /api/nursing/escalations/[id]
//   PATCH — acknowledge / respond / resolve an escalation
//   Body: { action: "acknowledge" | "respond" | "resolve", response?, resolution?, notes? }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { action, response, resolution, notes } = body;

  const existing = await db.nursingEscalation.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Escalation not found" }, { status: 404 });

  if (action === "acknowledge") {
    if (!session.user.permissions?.includes(PERMISSIONS.NURSING_ESCALATE) && !session.user.permissions?.includes(PERMISSIONS.CLINICAL_VIEW) && !session.user.roles.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await db.nursingEscalation.update({
      where: { id },
      data: { status: "acknowledged", responseById: session.user.id, respondedAt: new Date(), response: response || null },
    });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ESCALATION_ACKNOWLEDGED", resourceType: "nursing_escalation", resourceId: id });
    return NextResponse.json({ item: updated });
  }

  if (action === "respond") {
    if (!session.user.permissions?.includes(PERMISSIONS.NURSING_ESCALATE) && !session.user.permissions?.includes(PERMISSIONS.CLINICAL_VIEW) && !session.user.roles.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await db.nursingEscalation.update({
      where: { id },
      data: { status: "in_progress", responseById: session.user.id, respondedAt: new Date(), response: response || existing.response, notes: notes || existing.notes },
    });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ESCALATION_RESPONDED", resourceType: "nursing_escalation", resourceId: id, newValues: { response } });
    return NextResponse.json({ item: updated });
  }

  if (action === "resolve") {
    if (!session.user.permissions?.includes(PERMISSIONS.NURSING_ESCALATE) && !session.user.permissions?.includes(PERMISSIONS.CLINICAL_VIEW) && !session.user.roles.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await db.nursingEscalation.update({
      where: { id },
      data: { status: "resolved", resolution: resolution || null, resolvedAt: new Date(), resolvedById: session.user.id, notes: notes || existing.notes },
    });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ESCALATION_RESOLVED", resourceType: "nursing_escalation", resourceId: id, newValues: { resolution } });
    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
