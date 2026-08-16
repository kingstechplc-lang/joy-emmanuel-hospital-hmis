// =====================================================================
// API: /api/triage
//   GET  — list triage records (filter by facility/encounter/patient)
//   POST — create triage record + (optional) vital sign
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/triage?facilityId=...&encounterId=...&patientId=...&limit=50
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRIAGE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const encounterId = url.searchParams.get("encounterId");
  const patientId = url.searchParams.get("patientId");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: any = {};
  if (encounterId) where.encounterId = encounterId;
  if (patientId) where.patientId = patientId;
  if (facilityId) where.encounter = { facilityId };

  const records = await db.triageRecord.findMany({
    where,
    orderBy: { recordedAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } },
      encounter: { select: { id: true, encounterNumber: true, facilityId: true } },
      recordedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: records, count: records.length });
}

// POST /api/triage
// Body: { encounterId, patientId, vital fields..., recordVitalSigns?: true }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRIAGE_RECORD)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    encounterId, patientId,
    temperature, pulse, respiratoryRate, systolicBp, diastolicBp,
    oxygenSaturation, weight, height, bloodGlucose, painScore,
    consciousnessLevel, triageCategory, chiefComplaint, notes,
    recordVitalSigns = true,
  } = body;

  if (!encounterId || !patientId) {
    return NextResponse.json({ error: "encounterId and patientId are required" }, { status: 400 });
  }

  // Calculate BMI if weight + height provided
  let bmi: number | undefined;
  if (weight && height) {
    const h = height / 100;
    if (h > 0) bmi = Math.round((weight / (h * h)) * 10) / 10;
  }

  const triageRecord = await db.triageRecord.create({
    data: {
      encounterId,
      patientId,
      temperature: temperature || null,
      pulse: pulse || null,
      respiratoryRate: respiratoryRate || null,
      systolicBp: systolicBp || null,
      diastolicBp: diastolicBp || null,
      oxygenSaturation: oxygenSaturation || null,
      weight: weight || null,
      height: height || null,
      bmi: bmi || null,
      bloodGlucose: bloodGlucose || null,
      painScore: painScore || null,
      consciousnessLevel: consciousnessLevel || null,
      triageCategory: triageCategory || null,
      chiefComplaint: chiefComplaint || null,
      notes: notes || null,
      recordedById: session.user.id,
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      encounter: { select: { id: true, encounterNumber: true } },
    },
  });

  // Optionally create a VitalSign entry
  if (recordVitalSigns) {
    await db.vitalSign.create({
      data: {
        patientId,
        encounterId,
        temperature: temperature || null,
        pulse: pulse || null,
        respiratoryRate: respiratoryRate || null,
        systolicBp: systolicBp || null,
        diastolicBp: diastolicBp || null,
        oxygenSaturation: oxygenSaturation || null,
        weight: weight || null,
        height: height || null,
        bmi: bmi || null,
        bloodGlucose: bloodGlucose || null,
        painScore: painScore || null,
        recordedById: session.user.id,
      },
    });
  }

  // Update the linked encounter status to in_progress
  await db.encounter.updateMany({
    where: { id: encounterId, status: "open" },
    data: { status: "in_progress" },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "TRIAGE_RECORDED",
    resourceType: "triage_record",
    resourceId: triageRecord.id,
    newValues: { encounterId, patientId, triageCategory, bmi },
  });

  return NextResponse.json({ item: triageRecord }, { status: 201 });
}
