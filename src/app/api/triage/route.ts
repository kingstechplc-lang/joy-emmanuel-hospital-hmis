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

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const {
    encounterId, patientId,
    temperature, pulse, respiratoryRate, systolicBp, diastolicBp,
    oxygenSaturation, weight, height, bloodGlucose, painScore,
    consciousnessLevel, triageCategory, chiefComplaint, notes,
    recordVitalSigns = true,
    generalAppearance, painLocation, painCharacter,
    gcsEye, gcsVerbal, gcsMotor,
    isReassessment = false, parentTriageId,
    escalationLevel, escalationReason,
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

  // Calculate GCS total if components provided
  let gcsTotal: number | undefined;
  if (gcsEye && gcsVerbal && gcsMotor) {
    gcsTotal = gcsEye + gcsVerbal + gcsMotor;
  }

  // Detect abnormal vitals
  const abnormalAlerts: string[] = [];
  if (temperature != null) {
    if (temperature >= 39.5) abnormalAlerts.push(`CRITICAL: Temperature ${temperature}°C (≥39.5)`);
    else if (temperature >= 38.5) abnormalAlerts.push(`ABNORMAL: Temperature ${temperature}°C (fever)`);
    else if (temperature < 35.0) abnormalAlerts.push(`CRITICAL: Temperature ${temperature}°C (hypothermia)`);
  }
  if (pulse != null) {
    if (pulse >= 130) abnormalAlerts.push(`CRITICAL: Pulse ${pulse} bpm (≥130)`);
    else if (pulse < 40) abnormalAlerts.push(`CRITICAL: Pulse ${pulse} bpm (<40)`);
    else if (pulse >= 110) abnormalAlerts.push(`ABNORMAL: Pulse ${pulse} bpm (tachycardia)`);
    else if (pulse < 50) abnormalAlerts.push(`ABNORMAL: Pulse ${pulse} bpm (bradycardia)`);
  }
  if (systolicBp != null) {
    if (systolicBp >= 180) abnormalAlerts.push(`CRITICAL: Systolic BP ${systolicBp} mmHg (≥180)`);
    else if (systolicBp < 90) abnormalAlerts.push(`CRITICAL: Systolic BP ${systolicBp} mmHg (<90)`);
    else if (systolicBp >= 140) abnormalAlerts.push(`ABNORMAL: Systolic BP ${systolicBp} mmHg (hypertension)`);
  }
  if (diastolicBp != null) {
    if (diastolicBp >= 120) abnormalAlerts.push(`CRITICAL: Diastolic BP ${diastolicBp} mmHg (≥120)`);
    else if (diastolicBp < 50) abnormalAlerts.push(`CRITICAL: Diastolic BP ${diastolicBp} mmHg (<50)`);
  }
  if (oxygenSaturation != null) {
    if (oxygenSaturation < 90) abnormalAlerts.push(`CRITICAL: SpO2 ${oxygenSaturation}% (<90%)`);
    else if (oxygenSaturation < 94) abnormalAlerts.push(`ABNORMAL: SpO2 ${oxygenSaturation}% (low)`);
  }
  if (respiratoryRate != null) {
    if (respiratoryRate >= 30) abnormalAlerts.push(`CRITICAL: RR ${respiratoryRate}/min (≥30)`);
    else if (respiratoryRate < 8) abnormalAlerts.push(`CRITICAL: RR ${respiratoryRate}/min (<8)`);
    else if (respiratoryRate >= 24) abnormalAlerts.push(`ABNORMAL: RR ${respiratoryRate}/min (tachypnea)`);
  }
  if (painScore != null && painScore >= 7) {
    abnormalAlerts.push(`ABNORMAL: Pain score ${painScore}/10 (severe)`);
  }
  if (gcsTotal != null && gcsTotal <= 8) {
    abnormalAlerts.push(`CRITICAL: GCS ${gcsTotal}/15 (≤8 = coma)`);
  } else if (gcsTotal != null && gcsTotal <= 12) {
    abnormalAlerts.push(`ABNORMAL: GCS ${gcsTotal}/15 (moderate impairment)`);
  }
  if (bloodGlucose != null) {
    if (bloodGlucose >= 400) abnormalAlerts.push(`CRITICAL: Blood glucose ${bloodGlucose} mg/dL (≥400)`);
    else if (bloodGlucose < 50) abnormalAlerts.push(`CRITICAL: Blood glucose ${bloodGlucose} mg/dL (<50)`);
    else if (bloodGlucose >= 250) abnormalAlerts.push(`ABNORMAL: Blood glucose ${bloodGlucose} mg/dL (high)`);
  }
  const abnormalVitalsAlert = abnormalAlerts.length > 0 ? JSON.stringify(abnormalAlerts) : null;

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
      generalAppearance: generalAppearance || null,
      painLocation: painLocation || null,
      painCharacter: painCharacter || null,
      gcsEye: gcsEye || null,
      gcsVerbal: gcsVerbal || null,
      gcsMotor: gcsMotor || null,
      gcsTotal: gcsTotal || null,
      isReassessment: isReassessment || false,
      parentTriageId: parentTriageId || null,
      abnormalVitalsAlert,
      escalationLevel: escalationLevel || null,
      escalationReason: escalationReason || null,
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
