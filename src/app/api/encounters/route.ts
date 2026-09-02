// =====================================================================
// API: /api/encounters
//   GET  — list encounters with pagination, sorting, date filters
//   POST — create new encounter (requires encounter.create)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextEncounterNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { createEncounterSchema } from "@/lib/encounter-validation";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// --- Allowlists for sorting ---
const ALLOWED_SORT_FIELDS: Record<string, true> = {
  startAt: true,
  endAt: true,
  createdAt: true,
  updatedAt: true,
  encounterNumber: true,
  status: true,
  priority: true,
};

// GET /api/encounters?facilityId=...&status=...&type=...&patientId=...&limit=50&page=1&sortBy=startAt&sortOrder=desc&startDate=...&endDate=...
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
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
  const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
  const sortBy = url.searchParams.get("sortBy") || "startAt";
  const sortOrder = (url.searchParams.get("sortOrder") || "desc") as "asc" | "desc";
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  // Validate sortBy against allowlist
  const sortField = ALLOWED_SORT_FIELDS[sortBy] ? sortBy : "startAt";
  const order = sortOrder === "asc" ? "asc" : "desc";

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (type) where.encounterType = type;
  if (patientId) where.patientId = patientId;
  if (startDate || endDate) {
    where.startAt = {};
    if (startDate) where.startAt.gte = new Date(startDate);
    if (endDate) where.startAt.lte = new Date(`${endDate}T23:59:59`);
  }

  const offset = (page - 1) * limit;

  const [encounters, totalCount] = await Promise.all([
    db.encounter.findMany({
      where,
      orderBy: { [sortField]: order },
      take: limit,
      skip: offset,
      include: {
        patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true } },
        facility: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true } },
        _count: { select: { consultations: true, diagnoses: true, prescriptions: true, labOrders: true } },
      },
    }),
    db.encounter.count({ where }),
  ]);

  return NextResponse.json({
    items: encounters,
    count: encounters.length,
    totalCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit),
  });
}

// POST /api/encounters
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

  // Zod validation
  const parsed = createEncounterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: "Validation failed",
      details: parsed.error.issues.map((i: any) => ({ field: i.path.join("."), message: i.message })),
    }, { status: 400 });
  }
  const { patientId, facilityId, departmentId, encounterType, priority, attendingStaffId, source, externalId, notes } = parsed.data;

  // Validate patient belongs to this org
  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found or not in your organization" }, { status: 404 });
  }

  // Validate facility belongs to this org
  const facility = await db.facility.findUnique({ where: { id: facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Facility not found or not in your organization" }, { status: 404 });
  }

  // Validate department belongs to this facility (if provided)
  if (departmentId) {
    const dept = await db.department.findUnique({ where: { id: departmentId } });
    if (!dept || dept.facilityId !== facilityId) {
      return NextResponse.json({ error: "Department does not belong to this facility" }, { status: 400 });
    }
  }

  // Generate encounter number with retry for concurrency safety
  const encounterNumber = await nextEncounterNumber(facilityId);

  try {
    const encounter = await db.encounter.create({
      data: {
        patientId,
        facilityId,
        departmentId: departmentId || null,
        unitId: null,
        encounterNumber,
        encounterType,
        status: "open",
        priority,
        attendingStaffId: attendingStaffId || session.user.id,
        source,
        externalId: externalId || null,
        notes: notes || null,
        startAt: new Date(),
        checkInAt: new Date(),
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
      newValues: { encounterNumber, patientId, encounterType, priority, source },
    });

    return NextResponse.json({ item: encounter }, { status: 201 });
  } catch (e: any) {
    // If unique constraint violation on encounterNumber, retry
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Encounter number conflict — please retry" }, { status: 409 });
    }
    throw e;
  }
}
