// =====================================================================
// API: /api/tasks/[id]
//   GET    — fetch single task
//   PATCH  — update task / status transitions (in_progress, completed, cancelled)
//   DELETE — delete task
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TASK_COMPLETE) && !hasPermission(session, PERMISSIONS.TASK_ASSIGN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const task = await db.task.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true, username: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } },
      facility: { select: { id: true, name: true, code: true } },
    },
  });

  if (!task || task.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ item: task });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TASK_ASSIGN) && !hasPermission(session, PERMISSIONS.TASK_COMPLETE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { action, title, description, priority, assignedToId, dueAt, status } = body;

  const existing = await db.task.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateData: any = {};
  if (typeof title === "string") updateData.title = title;
  if (typeof description === "string") updateData.description = description || null;
  if (priority) updateData.priority = priority;
  if (assignedToId !== undefined) updateData.assignedToId = assignedToId || null;
  if (dueAt) updateData.dueAt = new Date(dueAt);

  if (action === "start") {
    updateData.status = "in_progress";
  } else if (action === "complete") {
    updateData.status = "completed";
    updateData.completedAt = new Date();
  } else if (action === "cancel") {
    updateData.status = "cancelled";
  } else if (typeof status === "string") {
    updateData.status = status;
    if (status === "completed") updateData.completedAt = new Date();
  }

  const updated = await db.task.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: action ? `TASK_${action.toUpperCase()}` : "TASK_UPDATED",
    resourceType: "task",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TASK_ASSIGN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.task.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.task.delete({ where: { id } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "TASK_DELETED",
    resourceType: "task",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
