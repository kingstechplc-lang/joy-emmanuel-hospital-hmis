// =====================================================================
// API: /api/maternity/[id]/anc
//   GET  — list ANC visits for a pregnancy
//   POST — create a new ANC visit
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextAppointmentNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { notifyAncVisitRecorded } from "@/lib/workflow-notifications";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MATERNITY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const visits = await db.ancVisit.findMany({
    where: { maternityRecordId: id },
    orderBy: { visitDate: "desc" },
    include: {
      recordedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: visits, count: visits.length });
}

// POST /api/maternity/[id]/anc
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MATERNITY_ANC_RECORD)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  // Load the maternity record to get patientId + facilityId
  const maternity = await db.maternityRecord.findUnique({
    where: { id },
    select: { id: true, patientId: true, facilityId: true },
  });
  if (!maternity) return NextResponse.json({ error: "Maternity record not found" }, { status: 404 });

  const {
    visitDate, gestationalAge,
    weight, bpSystolic, bpDiastolic, pulse, temperature, respiratoryRate, oxygenSaturation,
    fundalHeight, fetalHeartRate, fetalMovement, presentation, edema,
    symptoms, clinicalAssessment, riskFlags, nextVisitDate,
    educationTopics, notes,
    createAppointment = false,
  } = body;

  // Create ANC visit + optionally book next appointment in a transaction
  const result = await db.$transaction(async (tx) => {
    const visit = await tx.ancVisit.create({
      data: {
        maternityRecordId: id,
        patientId: maternity.patientId,
        facilityId: maternity.facilityId,
        visitDate: visitDate ? new Date(visitDate) : new Date(),
        gestationalAge: gestationalAge || null,
        weight: weight || null,
        bpSystolic: bpSystolic || null,
        bpDiastolic: bpDiastolic || null,
        pulse: pulse || null,
        temperature: temperature || null,
        respiratoryRate: respiratoryRate || null,
        oxygenSaturation: oxygenSaturation || null,
        fundalHeight: fundalHeight || null,
        fetalHeartRate: fetalHeartRate || null,
        fetalMovement: fetalMovement || null,
        presentation: presentation || null,
        edema: edema || null,
        symptoms: symptoms || null,
        clinicalAssessment: clinicalAssessment || null,
        riskFlags: riskFlags ? JSON.stringify(riskFlags) : null,
        nextVisitDate: nextVisitDate ? new Date(nextVisitDate) : null,
        educationTopics: educationTopics ? JSON.stringify(educationTopics) : null,
        notes: notes || null,
        recordedById: session.user.id,
      },
    });

    // Auto-book next ANC appointment if requested
    let appointmentId: string | null = null;
    if (createAppointment && nextVisitDate) {
      const apptCount = await tx.appointment.count({ where: { facilityId: maternity.facilityId } });
      const apptNumber = `APT-${new Date().getFullYear()}-${String(apptCount + 1).padStart(6, "0")}`;
      const appt = await tx.appointment.create({
        data: {
          patientId: maternity.patientId,
          facilityId: maternity.facilityId,
          appointmentNumber: apptNumber,
          appointmentType: "follow_up",
          scheduledStart: new Date(nextVisitDate),
          status: "scheduled",
          reason: `ANC follow-up visit${gestationalAge ? ` (GA ${gestationalAge}w)` : ""}`,
          notes: `Auto-booked from ANC visit ${visit.id}.`,
          createdById: session.user.id,
        },
      });
      appointmentId = appt.id;
    }

    return { visit, appointmentId };
  }).catch((err: any) => ({ error: err.message }));

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { visit, appointmentId } = result as { visit: any; appointmentId: string | null };

  // Reload with relations
  const fullVisit = await db.ancVisit.findUnique({
    where: { id: visit.id },
    include: {
      recordedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: maternity.facilityId,
    action: "ANC_VISIT_CREATED",
    resourceType: "anc_visit",
    resourceId: visit.id,
    newValues: { maternityRecordId: id, gestationalAge, weight, bpSystolic, bpDiastolic, appointmentId },
  });

  // 🔔 Fire workflow notification
  const patient = await db.patient.findUnique({
    where: { id: maternity.patientId },
    select: { firstName: true, lastName: true },
  });
  await notifyAncVisitRecorded({
    organizationId: session.user.organizationId,
    facilityId: maternity.facilityId,
    patientName: patient ? `${patient.firstName} ${patient.lastName}` : "Unknown",
    gestationalAge,
    nextVisitDate,
    maternityRecordId: id,
    ancVisitId: visit.id,
    recordedById: session.user.id,
  });

  return NextResponse.json({ item: fullVisit, appointmentId }, { status: 201 });
}
