// =====================================================================
// API: /api/nursing/tasks/[id]
//   PATCH — complete / miss / cancel / reassign a nursing task
//   Body: { action: "complete" | "miss" | "cancel" | "reassign", completionNotes?, assignedToId? }
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
  if (!session.user.permissions?.includes(PERMISSIONS.NURSING_TASK_MANAGE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { action, completionNotes, assignedToId } = body;

  const existing = await db.nursingTask.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  if (action === "complete") {
    const updated = await db.nursingTask.update({
      where: { id },
      data: { status: "completed", completedAt: new Date(), completedById: session.user.id, completionNotes: completionNotes || null },
    });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "NURSING_TASK_COMPLETED", resourceType: "nursing_task", resourceId: id });
    return NextResponse.json({ item: updated });
  }

  if (action === "miss") {
    const updated = await db.nursingTask.update({
      where: { id },
      data: { status: "missed", completionNotes: completionNotes || "Task missed" },
    });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "NURSING_TASK_MISSED", resourceType: "nursing_task", resourceId: id });
    return NextResponse.json({ item: updated });
  }

  if (action === "cancel") {
    const updated = await db.nursingTask.update({
      where: { id },
      data: { status: "cancelled", completionNotes: completionNotes || null },
    });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "NURSING_TASK_CANCELLED", resourceType: "nursing_task", resourceId: id });
    return NextResponse.json({ item: updated });
  }

  if (action === "reassign") {
    const updated = await db.nursingTask.update({
      where: { id },
      data: { assignedToId: assignedToId || null },
    });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "NURSING_TASK_REASSIGNED", resourceType: "nursing_task", resourceId: id, newValues: { assignedToId } });
    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
