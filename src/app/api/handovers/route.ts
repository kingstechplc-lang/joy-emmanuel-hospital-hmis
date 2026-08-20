// =====================================================================
// API: /api/handovers
//   GET  — list shift handovers (filter by facility, department, date)
//   POST — create a new shift handover note
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/handovers?facilityId=...&departmentId=...&shiftType=...&date=YYYY-MM-DD
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const departmentId = url.searchParams.get("departmentId");
  const shiftType = url.searchParams.get("shiftType");
  const date = url.searchParams.get("date"); // YYYY-MM-DD
  const today = url.searchParams.get("today") === "true";
  const limit = parseInt(url.searchParams.get("limit") || "200");

  // Scope facilities to user's org
  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) {
    where.facilityId = facilityId;
  } else {
    where.facilityId = { in: orgFacilityIds };
  }
  if (departmentId) where.departmentId = departmentId;
  if (shiftType && shiftType !== "all") where.shiftType = shiftType;

  // Date filter
  if (today) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    where.handoverDate = { gte: start, lte: end };
  } else if (date) {
    const start = new Date(date + "T00:00:00");
    const end = new Date(date + "T23:59:59.999");
    where.handoverDate = { gte: start, lte: end };
  }

  const handovers = await db.shiftHandover.findMany({
    where,
    orderBy: [{ handoverDate: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      outgoingStaff: { select: { id: true, firstName: true, lastName: true, username: true } },
      incomingStaff: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });

  return NextResponse.json({ items: handovers, count: handovers.length });
}

// POST /api/handovers
// body: { facilityId, departmentId?, shiftType, outgoingStaffId?, incomingStaffId?,
//         patientsToFlag?: string[], notes, pendingTasks?, handoverDate? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
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
    facilityId,
    departmentId,
    shiftType,
    outgoingStaffId,
    incomingStaffId,
    patientsToFlag,
    notes,
    pendingTasks,
    handoverDate,
  } = body;

  if (!facilityId || !shiftType || !notes) {
    return NextResponse.json({ error: "facilityId, shiftType, notes are required" }, { status: 400 });
  }

  const validShifts = ["morning", "evening", "night"];
  if (!validShifts.includes(shiftType)) {
    return NextResponse.json({ error: `shiftType must be one of: ${validShifts.join(", ")}` }, { status: 400 });
  }

  // Validate facility scope
  const facility = await db.facility.findUnique({ where: { id: facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  }

  // Validate department (if provided)
  if (departmentId) {
    const dept = await db.department.findUnique({ where: { id: departmentId } });
    if (!dept || dept.facilityId !== facilityId) {
      return NextResponse.json({ error: "Invalid department for this facility" }, { status: 400 });
    }
  }

  const handover = await db.shiftHandover.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId,
      departmentId: departmentId || null,
      shiftType,
      handoverDate: handoverDate ? new Date(handoverDate) : new Date(),
      outgoingStaffId: outgoingStaffId || null,
      incomingStaffId: incomingStaffId || null,
      patientsToFlag: Array.isArray(patientsToFlag) && patientsToFlag.length > 0 ? JSON.stringify(patientsToFlag) : null,
      notes,
      pendingTasks: pendingTasks || null,
      status: "completed",
    },
    include: {
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      outgoingStaff: { select: { id: true, firstName: true, lastName: true, username: true } },
      incomingStaff: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "SHIFT_HANDOVER_CREATED",
    resourceType: "shift_handover",
    resourceId: handover.id,
    newValues: { shiftType, departmentId, outgoingStaffId, incomingStaffId, notesPreview: notes.slice(0, 200) },
  });

  return NextResponse.json({ item: handover }, { status: 201 });
}
