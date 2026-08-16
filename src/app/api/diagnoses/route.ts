// =====================================================================
// API: /api/diagnoses
//   GET  — list diagnoses (filter by patient/encounter)
//   POST — create diagnosis
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/diagnoses?patientId=...&encounterId=...&status=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DIAGNOSIS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const encounterId = url.searchParams.get("encounterId");
  const status = url.searchParams.get("status");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (encounterId) where.encounterId = encounterId;
  if (status) where.clinicalStatus = status;

  const diagnoses = await db.diagnosis.findMany({
    where,
    orderBy: { diagnosedAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      encounter: { select: { id: true, encounterNumber: true, facility: { select: { name: true } } } },
    },
  });

  return NextResponse.json({ items: diagnoses, count: diagnoses.length });
}

// POST /api/diagnoses
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DIAGNOSIS_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    patientId, encounterId, diagnosisCode, diagnosisName,
    diagnosisType, clinicalStatus, onsetDate, notes,
  } = body;

  if (!patientId || !encounterId || !diagnosisName) {
    return NextResponse.json({ error: "patientId, encounterId and diagnosisName are required" }, { status: 400 });
  }

  const diagnosis = await db.diagnosis.create({
    data: {
      patientId,
      encounterId,
      diagnosisCode: diagnosisCode || null,
      diagnosisName,
      diagnosisType: diagnosisType || "primary",
      clinicalStatus: clinicalStatus || "active",
      onsetDate: onsetDate ? new Date(onsetDate) : null,
      diagnosedById: session.user.id,
      notes: notes || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "DIAGNOSIS_CREATED",
    resourceType: "diagnosis",
    resourceId: diagnosis.id,
    newValues: { patientId, encounterId, diagnosisName, diagnosisType },
  });

  return NextResponse.json({ item: diagnosis }, { status: 201 });
}
