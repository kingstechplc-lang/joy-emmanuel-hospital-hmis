// =====================================================================
// API: /api/tasks
//   GET  — list tasks (filter by facility, assignee, status, priority)
//   POST — create a new task
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TASK_ASSIGN) && !hasPermission(session, PERMISSIONS.TASK_COMPLETE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const assignedToId = url.searchParams.get("assignedToId");
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const assignedToMe = url.searchParams.get("assignedToMe") === "true";

  // Scope facilities to user's org
  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) where.facilityId = facilityId;
  else where.facilityId = { in: orgFacilityIds };
  if (assignedToId) where.assignedToId = assignedToId;
  if (assignedToMe) where.assignedToId = session.user.id;
  if (status && status !== "all") where.status = status;
  if (priority && priority !== "all") where.priority = priority;

  const tasks = await db.task.findMany({
    where,
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true, username: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } },
      facility: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json({ items: tasks, count: tasks.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TASK_ASSIGN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const {
    title,
    description,
    priority,
    assignedToId,
    dueAt,
    facilityId,
    departmentId,
    patientId,
    encounterId,
  } = body;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // Validate facility scope
  let resolvedFacilityId = facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  const task = await db.task.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      departmentId: departmentId || null,
      patientId: patientId || null,
      encounterId: encounterId || null,
      title,
      description: description || null,
      priority: priority || "routine",
      assignedToId: assignedToId || null,
      createdById: session.user.id,
      dueAt: dueAt ? new Date(dueAt) : null,
      status: "pending",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "TASK_CREATED",
    resourceType: "task",
    resourceId: task.id,
    newValues: { title, priority, assignedToId, dueAt },
  });

  return NextResponse.json({ item: task }, { status: 201 });
}
