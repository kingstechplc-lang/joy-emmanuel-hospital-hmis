// =====================================================================
// API: /api/nursing
//   GET  — list NursingNotes (filter by patient, admission, encounter)
//   POST — create NursingNote OR CarePlan (body.recordType="note"|"care_plan")
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/nursing?patientId=...&admissionId=...&encounterId=...&type=note|care_plan
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const admissionId = url.searchParams.get("admissionId");
  const encounterId = url.searchParams.get("encounterId");
  const type = url.searchParams.get("type") || "note"; // note | care_plan | both
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const result: any = {};

  if (type === "note" || type === "both") {
    const where: any = {};
    if (patientId) where.patientId = patientId;
    if (admissionId) where.admissionId = admissionId;
    if (encounterId) where.encounterId = encounterId;

    const notes = await db.nursingNote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
        encounter: { select: { id: true, encounterNumber: true } },
        admission: { select: { id: true, admissionNumber: true } },
        nurse: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    result.notes = notes;
  }

  if (type === "care_plan" || type === "both") {
    const where: any = {};
    if (patientId) where.patientId = patientId;
    if (admissionId) where.admissionId = admissionId;
    if (encounterId) where.encounterId = encounterId;

    const plans = await db.carePlan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
        encounter: { select: { id: true, encounterNumber: true } },
        admission: { select: { id: true, admissionNumber: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    result.carePlans = plans;
  }

  return NextResponse.json(result);
}

// POST /api/nursing
// body.recordType: "note" | "care_plan"
// NOTE body: { recordType: "note", patientId, encounterId, admissionId?, noteType, content }
// CARE PLAN body: { recordType: "care_plan", patientId, encounterId, admissionId?, problem, goal, interventions, evaluation }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const recordType = body.recordType || "note";

  if (recordType === "note") {
    const { patientId, encounterId, admissionId, noteType, content } = body;
    if (!patientId || !encounterId || !content) {
      return NextResponse.json({ error: "patientId, encounterId, content are required" }, { status: 400 });
    }

    const note = await db.nursingNote.create({
      data: {
        patientId,
        encounterId,
        admissionId: admissionId || null,
        nurseId: session.user.id,
        noteType: noteType || "observation",
        content,
      },
      include: {
        patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
        encounter: { select: { id: true, encounterNumber: true } },
        admission: { select: { id: true, admissionNumber: true } },
        nurse: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "NURSING_NOTE_CREATED",
      resourceType: "nursing_note",
      resourceId: note.id,
      newValues: { patientId, encounterId, admissionId, noteType, contentPreview: content.slice(0, 120) },
    });

    return NextResponse.json({ item: note }, { status: 201 });
  }

  if (recordType === "care_plan") {
    const { patientId, encounterId, admissionId, problem, goal, interventions, evaluation } = body;
    if (!patientId || !encounterId || !problem) {
      return NextResponse.json({ error: "patientId, encounterId, problem are required" }, { status: 400 });
    }

    const plan = await db.carePlan.create({
      data: {
        patientId,
        encounterId,
        admissionId: admissionId || null,
        problem,
        goal: goal || null,
        interventions: interventions || null,
        evaluation: evaluation || null,
        createdById: session.user.id,
      },
      include: {
        patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
        encounter: { select: { id: true, encounterNumber: true } },
        admission: { select: { id: true, admissionNumber: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "CARE_PLAN_CREATED",
      resourceType: "care_plan",
      resourceId: plan.id,
      newValues: { patientId, encounterId, admissionId, problem, goal },
    });

    return NextResponse.json({ item: plan }, { status: 201 });
  }

  return NextResponse.json({ error: `Unknown recordType: ${recordType}` }, { status: 400 });
}
