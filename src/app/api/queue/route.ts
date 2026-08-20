// =====================================================================
// API: /api/queue
//   GET  — list today's queues + entries for facility/department
//   POST — add patient to queue (creates QueueEntry, auto-increments queueNumber)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/queue?facilityId=...&departmentId=...&date=...&status=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const departmentId = url.searchParams.get("departmentId");
  const status = url.searchParams.get("status");
  const dateStr = url.searchParams.get("date") || new Date().toISOString().split("T")[0];

  if (!facilityId) {
    return NextResponse.json({ items: [], count: 0 });
  }

  // Compute start/end of day for filter
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59`);

  const queuesWhere: any = { facilityId, queueDate: { gte: dayStart, lte: dayEnd } };
  if (departmentId) queuesWhere.departmentId = departmentId;

  // Find queues for the day
  let queues = await db.queue.findMany({
    where: queuesWhere,
    orderBy: { createdAt: "asc" },
    include: {
      department: { select: { id: true, name: true } },
      facility: { select: { id: true, name: true } },
      entries: {
        where: status ? { status } : undefined,
        orderBy: { queueNumber: "asc" },
        include: {
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true } },
          encounter: { select: { id: true, encounterNumber: true } },
        },
      },
    },
  });

  // Auto-create a default queue per facility (and per department if specified) if none exists
  if (queues.length === 0) {
    const facility = await db.facility.findUnique({ where: { id: facilityId } });
    if (facility) {
      const newQueue = await db.queue.create({
        data: {
          facilityId,
          departmentId: departmentId || null,
          queueDate: new Date(),
          queueType: "consultation",
          status: "active",
        },
        include: {
          department: { select: { id: true, name: true } },
          facility: { select: { id: true, name: true } },
          entries: { include: { patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } }, encounter: { select: { id: true, encounterNumber: true } } } },
        },
      });
      queues = [newQueue];
    }
  }

  return NextResponse.json({ items: queues, count: queues.length });
}

// POST /api/queue — add entry
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { queueId, patientId, encounterId, priority, facilityId, departmentId, queueType } = body;

  if (!patientId) {
    return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  }

  let queue = queueId ? await db.queue.findUnique({ where: { id: queueId } }) : null;

  // If no queue exists for today, create one
  if (!queue) {
    const targetFacilityId = facilityId || session.user.facilityId;
    if (!targetFacilityId) {
      return NextResponse.json({ error: "facilityId is required" }, { status: 400 });
    }
    queue = await db.queue.create({
      data: {
        facilityId: targetFacilityId,
        departmentId: departmentId || null,
        queueDate: new Date(),
        queueType: queueType || "consultation",
        status: "active",
      },
    });
  }

  // Compute next queue number for this queue
  const lastEntry = await db.queueEntry.findFirst({
    where: { queueId: queue.id },
    orderBy: { queueNumber: "desc" },
  });
  const nextNumber = (lastEntry?.queueNumber || 0) + 1;

  const entry = await db.queueEntry.create({
    data: {
      queueId: queue.id,
      patientId,
      encounterId: encounterId || null,
      queueNumber: nextNumber,
      priority: priority || "routine",
      status: "waiting",
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: queue.facilityId,
    action: "QUEUE_ENTRY_ADDED",
    resourceType: "queue_entry",
    resourceId: entry.id,
    newValues: { queueId: queue.id, patientId, queueNumber: nextNumber, priority: entry.priority },
  });

  return NextResponse.json({ item: entry }, { status: 201 });
}
