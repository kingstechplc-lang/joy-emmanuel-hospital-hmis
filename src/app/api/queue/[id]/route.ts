// =====================================================================
// API: /api/queue/[id]
//   PATCH — update QueueEntry status (called → in_progress → completed)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const entry = await db.queueEntry.findUnique({
    where: { id },
    include: {
      patient: true,
      encounter: true,
      queue: { include: { facility: true, department: true } },
    },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item: entry });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_EDIT)) {
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
  const { status, assignedStaffId, priority, notes, transferToQueueId, skipReason, noShowReason } = body;

  const existing = await db.queueEntry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: any = {};
  if (status) {
    data.status = status;
    if (status === "called") data.calledAt = new Date();
    if (status === "in_progress") data.startedAt = new Date();
    if (status === "completed") data.completedAt = new Date();
    if (status === "on_hold") data.onHoldAt = new Date();
    if (status === "waiting" && existing.status === "on_hold") data.resumedAt = new Date();
    if (status === "skipped") data.notes = skipReason ? `Skipped: ${skipReason}` : (existing.notes || "");
    if (status === "cancelled" && noShowReason) data.notes = `No-show: ${noShowReason}`;
  }
  if (assignedStaffId !== undefined) data.assignedStaffId = assignedStaffId || null;
  if (priority) data.priority = priority;
  if (notes !== undefined) data.notes = notes;

  // Handle transfer to different queue
  if (transferToQueueId && transferToQueueId !== existing.queueId) {
    const targetQueue = await db.queue.findUnique({ where: { id: transferToQueueId } });
    if (!targetQueue) return NextResponse.json({ error: "Target queue not found" }, { status: 404 });

    // Get next queue number for target queue
    const maxNum = await db.queueEntry.findFirst({
      where: { queueId: transferToQueueId },
      orderBy: { queueNumber: "desc" },
      select: { queueNumber: true },
    });
    const newQueueNumber = (maxNum?.queueNumber || 0) + 1;
    data.queueId = transferToQueueId;
    data.queueNumber = newQueueNumber;
    data.status = "waiting";
    data.calledAt = null;
    data.startedAt = null;

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: session.user.facilityId || undefined,
      action: "QUEUE_ENTRY_TRANSFERRED",
      resourceType: "queue_entry",
      resourceId: id,
      oldValues: { queueId: existing.queueId, queueNumber: existing.queueNumber },
      newValues: { queueId: transferToQueueId, queueNumber: newQueueNumber },
    });
  }

  const updated = await db.queueEntry.update({ where: { id }, data });

  // If status changed to in_progress, also update the linked encounter status
  if (status === "in_progress" && existing.encounterId) {
    await db.encounter.updateMany({
      where: { id: existing.encounterId, status: "open" },
      data: { status: "in_progress" },
    });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "QUEUE_ENTRY_UPDATED",
    resourceType: "queue_entry",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_EDIT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.queueEntry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft-cancel rather than delete (preserve audit trail)
  const updated = await db.queueEntry.update({
    where: { id },
    data: { status: "cancelled" },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "QUEUE_ENTRY_CANCELLED",
    resourceType: "queue_entry",
    resourceId: id,
    oldValues: { status: existing.status },
  });

  return NextResponse.json({ item: updated });
}
