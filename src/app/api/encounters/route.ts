// =====================================================================
// API: /api/encounters
//   GET  — list encounters filtered by facility/status/type
//   POST — create new encounter (requires encounter.create)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextEncounterNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

// GET /api/encounters?facilityId=...&status=...&type=...&patientId=...&limit=50
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const patientId = url.searchParams.get("patientId");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (type) where.encounterType = type;
  if (patientId) where.patientId = patientId;

  const encounters = await db.encounter.findMany({
    where,
    orderBy: { startAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true } },
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true } },
      _count: { select: { consultations: true, diagnoses: true, prescriptions: true, labOrders: true } },
    },
  });

  return NextResponse.json({ items: encounters, count: encounters.length });
}

// POST /api/encounters
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { patientId, facilityId, departmentId, encounterType, priority, attendingStaffId } = body;

  if (!patientId || !facilityId) {
    return NextResponse.json({ error: "patientId and facilityId are required" }, { status: 400 });
  }

  const encounterNumber = await nextEncounterNumber(facilityId);

  const encounter = await db.encounter.create({
    data: {
      patientId,
      facilityId,
      departmentId: departmentId || null,
      unitId: null,
      encounterNumber,
      encounterType: encounterType || "opd",
      status: "open",
      priority: priority || "routine",
      attendingStaffId: attendingStaffId || session.user.id,
      startAt: new Date(),
      createdById: session.user.id,
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      facility: { select: { id: true, name: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "ENCOUNTER_CREATED",
    resourceType: "encounter",
    resourceId: encounter.id,
    newValues: { encounterNumber, patientId, encounterType, priority },
  });

  return NextResponse.json({ item: encounter }, { status: 201 });
}
