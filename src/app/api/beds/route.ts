// =====================================================================
// API: /api/beds
//   GET  — list beds grouped by ward (filter by facility, ward, status,
//          bedType, genderRestriction, isolationCapable, oxygen, ventilator,
//          monitoring, accessibility, lifecycleStatus)
//          includes current active bed_assignment with patient info
//   POST — create a new bed (bed master CRUD)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/beds?facilityId=...&wardId=...&status=...&bedType=...&genderRestriction=...
//   &isolationCapable=true&oxygen=true&ventilator=true&cardiacMonitoring=true
//   &accessibility=true&lifecycleStatus=active
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW) && !hasPermission(session, PERMISSIONS.BED_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const wardId = url.searchParams.get("wardId");
  const status = url.searchParams.get("status");
  const bedType = url.searchParams.get("bedType");
  const genderRestriction = url.searchParams.get("genderRestriction");
  const isolationCapable = url.searchParams.get("isolationCapable");
  const oxygen = url.searchParams.get("oxygen");
  const ventilator = url.searchParams.get("ventilator");
  const cardiacMonitoring = url.searchParams.get("cardiacMonitoring");
  const icuMonitoring = url.searchParams.get("icuMonitoring");
  const suction = url.searchParams.get("suction");
  const accessibility = url.searchParams.get("accessibility");
  const lifecycleStatus = url.searchParams.get("lifecycleStatus") || "active";
  const building = url.searchParams.get("building");
  const floor = url.searchParams.get("floor");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (wardId) where.wardId = wardId;
  if (status) where.status = status;
  if (bedType) where.bedType = bedType;
  if (genderRestriction) where.genderRestriction = genderRestriction;
  if (isolationCapable === "true") where.isolationCapable = true;
  if (oxygen === "true") where.oxygen = true;
  if (ventilator === "true") where.ventilator = true;
  if (cardiacMonitoring === "true") where.cardiacMonitoring = true;
  if (icuMonitoring === "true") where.icuMonitoring = true;
  if (suction === "true") where.suction = true;
  if (accessibility === "true") where.accessibility = true;
  if (lifecycleStatus && lifecycleStatus !== "all") where.lifecycleStatus = lifecycleStatus;
  if (building) where.building = building;
  if (floor) where.floor = floor;

  const beds = await db.bed.findMany({
    where,
    orderBy: [{ wardId: "asc" }, { bedNumber: "asc" }],
    include: {
      ward: { select: { id: true, name: true, code: true, wardType: true, capacity: true } },
      room: { select: { id: true, roomNumber: true, roomType: true } },
      bedAssignments: {
        where: { status: "active" },
        take: 1,
        include: {
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true } },
          admission: {
            select: {
              id: true, admissionNumber: true, admissionType: true, admissionDiagnosis: true,
              admittedAt: true, status: true,
              admittedBy: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
      bedReservations: {
        where: { status: "active" },
        take: 1,
      },
    },
  });

  // Also fetch all active wards (so wards with no beds still appear on the board)
  const allWards = await db.ward.findMany({
    where: { ...(facilityId ? { facilityId } : {}), status: "active" },
    select: { id: true, name: true, code: true, wardType: true, capacity: true },
    orderBy: { name: "asc" },
  });

  // Group beds by ward for the frontend
  const wardMap = new Map<string, any>();
  // Initialize with ALL wards (even those with 0 beds)
  for (const w of allWards) {
    wardMap.set(w.id, { ward: w, beds: [] });
  }
  for (const b of beds) {
    const wId = b.wardId;
    if (!wardMap.has(wId)) {
      // Bed belongs to a ward not in our allWards list (possibly inactive ward) — still show it
      wardMap.set(wId, {
        ward: b.ward,
        beds: [],
      });
    }
    wardMap.get(wId)!.beds.push(b);
  }

  return NextResponse.json({
    items: beds,
    wards: Array.from(wardMap.values()),
    count: beds.length,
  });
}

// POST /api/beds — create a new bed
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BED_MANAGE)) {
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
    facilityId, wardId, roomId, bedNumber, bedCode, bedType,
    building, floor, genderRestriction, ageRestriction,
    isolationCapable, oxygen, ventilator, cardiacMonitoring, icuMonitoring, suction, accessibility,
    description, notes,
  } = body;

  if (!facilityId || !wardId || !bedNumber) {
    return NextResponse.json({ error: "facilityId, wardId, and bedNumber are required" }, { status: 400 });
  }

  // Check for duplicate bed number in the same ward
  const existing = await db.bed.findUnique({
    where: { wardId_bedNumber: { wardId, bedNumber } },
  });
  if (existing) {
    return NextResponse.json({ error: "Bed with this number already exists in this ward" }, { status: 409 });
  }

  const bed = await db.bed.create({
    data: {
      facilityId,
      wardId,
      roomId: roomId || null,
      bedNumber,
      bedCode: bedCode || null,
      bedType: bedType || null,
      building: building || null,
      floor: floor || null,
      genderRestriction: genderRestriction || null,
      ageRestriction: ageRestriction || null,
      isolationCapable: !!isolationCapable,
      oxygen: !!oxygen,
      ventilator: !!ventilator,
      cardiacMonitoring: !!cardiacMonitoring,
      icuMonitoring: !!icuMonitoring,
      suction: !!suction,
      accessibility: !!accessibility,
      description: description || null,
      notes: notes || null,
      status: "available",
      lifecycleStatus: "active",
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "BED_CREATED",
    resourceType: "bed",
    resourceId: bed.id,
    newValues: { bedNumber, bedCode, bedType, wardId, facilityId },
  });

  return NextResponse.json({ item: bed }, { status: 201 });
}
