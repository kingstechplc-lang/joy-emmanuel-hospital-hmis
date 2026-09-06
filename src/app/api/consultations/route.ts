// =====================================================================
// API: /api/consultations
//   GET  — list consultations (filter by facility/patient/encounter)
//   POST — create new consultation
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/consultations?facilityId=...&patientId=...&encounterId=...&status=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const patientId = url.searchParams.get("patientId");
  const encounterId = url.searchParams.get("encounterId");
  const status = url.searchParams.get("status");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (encounterId) where.encounterId = encounterId;
  if (status) where.status = status;
  if (facilityId) where.encounter = { facilityId };

  const consultations = await db.consultation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } },
      encounter: { select: { id: true, encounterNumber: true, facilityId: true, facility: { select: { id: true, name: true } } } },
      clinician: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: consultations, count: consultations.length });
}

// POST /api/consultations
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_CREATE)) {
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
    encounterId, patientId, clinicianId,
    chiefComplaint, historyPresentingIllness,
    pastMedicalHistory, pastSurgicalHistory, medicationHistory,
    familyHistory, socialHistory, reviewOfSystems,
    physicalExamination, assessment, treatmentPlan, followUpPlan,
  } = body;

  if (!encounterId || !patientId) {
    return NextResponse.json({ error: "encounterId and patientId are required" }, { status: 400 });
  }

  // ─── IDOR / consistency check (per spec §15) ─────────────────────────
  // Verify the encounter actually belongs to the claimed patient AND to
  // the authenticated user's organization.  Without this check, a malicious
  // client could POST { patientId: A, encounterId: B } where encounter B
  // belongs to a different patient — creating a consultation attached to
  // the wrong encounter in Patient 360.
  const encounter = await db.encounter.findFirst({
    where: { id: encounterId, patientId },
    include: { facility: { select: { organizationId: true } } },
  });
  if (!encounter) {
    return NextResponse.json(
      { error: "Encounter not found for this patient. Cannot create a consultation against a mismatched encounter." },
      { status: 404 }
    );
  }
  // Organization isolation: the encounter's facility must belong to the
  // authenticated user's organization.  (Facility→Organization is a hard
  // FK in the schema; this check enforces cross-org isolation at the API
  // layer in addition to the DB-level FK.)
  if (encounter.facility?.organizationId !== session.user.organizationId) {
    return NextResponse.json(
      { error: "Encounter does not belong to your organization." },
      { status: 403 }
    );
  }

  const consultation = await db.consultation.create({
    data: {
      encounterId,
      patientId,
      clinicianId: clinicianId || session.user.id,
      chiefComplaint: chiefComplaint || null,
      historyPresentingIllness: historyPresentingIllness || null,
      pastMedicalHistory: pastMedicalHistory || null,
      pastSurgicalHistory: pastSurgicalHistory || null,
      medicationHistory: medicationHistory || null,
      familyHistory: familyHistory || null,
      socialHistory: socialHistory || null,
      reviewOfSystems: reviewOfSystems || null,
      physicalExamination: physicalExamination || null,
      assessment: assessment || null,
      treatmentPlan: treatmentPlan || null,
      followUpPlan: followUpPlan || null,
      status: "draft",
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      encounter: { select: { id: true, encounterNumber: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "CONSULTATION_CREATED",
    resourceType: "consultation",
    resourceId: consultation.id,
    newValues: { encounterId, patientId, chiefComplaint },
  });

  return NextResponse.json({ item: consultation }, { status: 201 });
}
