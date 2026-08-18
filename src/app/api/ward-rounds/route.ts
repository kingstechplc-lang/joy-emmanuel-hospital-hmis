// =====================================================================
// API: /api/ward-rounds
//   GET  — list ward rounds (filter by facility, ward, date)
//   POST — create a new ward round record
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/ward-rounds?facilityId=...&wardId=...&date=YYYY-MM-DD
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const wardId = url.searchParams.get("wardId");
  const date = url.searchParams.get("date"); // YYYY-MM-DD
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
  if (wardId) where.wardId = wardId;

  if (date) {
    const start = new Date(date + "T00:00:00");
    const end = new Date(date + "T23:59:59.999");
    where.roundDate = { gte: start, lte: end };
  }

  const rounds = await db.wardRound.findMany({
    where,
    orderBy: [{ roundDate: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      facility: { select: { id: true, name: true, code: true } },
      ward: { select: { id: true, name: true, code: true } },
      consultant: { select: { id: true, firstName: true, lastName: true, username: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });

  // Hydrate patientsSeen JSON -> array (and pull patient details if any)
  const allPatientIds = Array.from(
    new Set(
      rounds.flatMap((r: any) => {
        try {
          const arr = r.patientsSeen ? JSON.parse(r.patientsSeen) : [];
          return Array.isArray(arr) ? arr : [];
        } catch {
          return [];
        }
      })
    )
  ) as string[];

  const patients = allPatientIds.length
    ? await db.patient.findMany({
        where: { id: { in: allPatientIds } },
        select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true },
      })
    : [];

  const patientMap = new Map(patients.map((p) => [p.id, p]));

  const enriched = rounds.map((r: any) => {
    let parsedPatients: string[] = [];
    try {
      const arr = r.patientsSeen ? JSON.parse(r.patientsSeen) : [];
      parsedPatients = Array.isArray(arr) ? arr : [];
    } catch {
      parsedPatients = [];
    }
    return {
      ...r,
      patientsSeenIds: parsedPatients,
      patients: parsedPatients.map((id: string) => patientMap.get(id)).filter(Boolean),
    };
  });

  return NextResponse.json({ items: enriched, count: enriched.length });
}

// POST /api/ward-rounds
// body: { facilityId, wardId?, consultantId?, roundDate?, patientsSeen?: string[],
//         notes?, planChanges? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { facilityId, wardId, consultantId, roundDate, patientsSeen, notes, planChanges } = body;

  if (!facilityId) {
    return NextResponse.json({ error: "facilityId is required" }, { status: 400 });
  }

  // Validate facility scope
  const facility = await db.facility.findUnique({ where: { id: facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  }

  // Validate ward (if provided)
  if (wardId) {
    const ward = await db.ward.findUnique({ where: { id: wardId } });
    if (!ward || ward.facilityId !== facilityId) {
      return NextResponse.json({ error: "Invalid ward for this facility" }, { status: 400 });
    }
  }

  const round = await db.wardRound.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId,
      wardId: wardId || null,
      consultantId: consultantId || null,
      roundDate: roundDate ? new Date(roundDate) : new Date(),
      patientsSeen: Array.isArray(patientsSeen) && patientsSeen.length > 0 ? JSON.stringify(patientsSeen) : null,
      notes: notes || null,
      planChanges: planChanges || null,
      createdById: session.user.id,
    },
    include: {
      facility: { select: { id: true, name: true, code: true } },
      ward: { select: { id: true, name: true, code: true } },
      consultant: { select: { id: true, firstName: true, lastName: true, username: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "WARD_ROUND_CREATED",
    resourceType: "ward_round",
    resourceId: round.id,
    newValues: {
      wardId,
      consultantId,
      roundDate: round.roundDate,
      patientsSeenCount: Array.isArray(patientsSeen) ? patientsSeen.length : 0,
      notesPreview: notes ? notes.slice(0, 200) : null,
    },
  });

  return NextResponse.json({ item: round }, { status: 201 });
}
