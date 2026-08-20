// =====================================================================
// API: /api/immunizations
//   GET  — list immunizations (filter by facility/patient)
//   POST — record immunization
//   PATCH /api/immunizations/[id] — update
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/immunizations?facilityId=...&patientId=...&limit=50
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const patientId = url.searchParams.get("patientId");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (patientId) where.patientId = patientId;

  const immunizations = await db.immunization.findMany({
    where,
    orderBy: { administeredAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true } },
      facility: { select: { id: true, name: true } },
      administeredBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: immunizations, count: immunizations.length });
}

// POST /api/immunizations
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRIAGE_RECORD)) {
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
    patientId, vaccineName, dose, batchNumber,
    administeredAt, nextDueAt, facilityId, notes,
  } = body;

  if (!patientId || !vaccineName || !facilityId) {
    return NextResponse.json({ error: "patientId, vaccineName and facilityId are required" }, { status: 400 });
  }

  const immunization = await db.immunization.create({
    data: {
      patientId,
      vaccineName,
      dose: dose || null,
      batchNumber: batchNumber || null,
      administeredAt: administeredAt ? new Date(administeredAt) : new Date(),
      nextDueAt: nextDueAt ? new Date(nextDueAt) : null,
      facilityId,
      administeredById: session.user.id,
      notes: notes || null,
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
    action: "IMMUNIZATION_RECORDED",
    resourceType: "immunization",
    resourceId: immunization.id,
    newValues: { patientId, vaccineName, dose, batchNumber },
  });

  return NextResponse.json({ item: immunization }, { status: 201 });
}
