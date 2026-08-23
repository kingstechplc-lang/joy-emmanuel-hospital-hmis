// =====================================================================
// API: /api/maternity/[id]/postnatal
//   GET  — list postnatal visits for a pregnancy
//   POST — create a postnatal visit
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MATERNITY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const visits = await db.postnatalVisit.findMany({
    where: { maternityRecordId: id },
    orderBy: { visitDate: "desc" },
    include: {
      recordedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: visits, count: visits.length });
}

// POST /api/maternity/[id]/postnatal
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

  const maternity = await db.maternityRecord.findUnique({
    where: { id },
    select: { id: true, patientId: true, facilityId: true },
  });
  if (!maternity) return NextResponse.json({ error: "Maternity record not found" }, { status: 404 });

  const {
    visitDate, visitType,
    maternalStatus, bpSystolic, bpDiastolic, pulse, temperature,
    bleeding, pain, woundCondition, uterineAssessment,
    breastfeeding, emotionalStatus,
    newbornStatus, newbornNotes,
    familyPlanningCounseling, familyPlanningMethod, educationTopics,
    nextFollowUpDate, notes,
  } = body;

  const visit = await db.postnatalVisit.create({
    data: {
      maternityRecordId: id,
      patientId: maternity.patientId,
      facilityId: maternity.facilityId,
      visitDate: visitDate ? new Date(visitDate) : new Date(),
      visitType: visitType || "routine",
      maternalStatus: maternalStatus || null,
      bpSystolic: bpSystolic || null,
      bpDiastolic: bpDiastolic || null,
      pulse: pulse || null,
      temperature: temperature || null,
      bleeding: bleeding || null,
      pain: pain || null,
      woundCondition: woundCondition || null,
      uterineAssessment: uterineAssessment || null,
      breastfeeding: breastfeeding || null,
      emotionalStatus: emotionalStatus || null,
      newbornStatus: newbornStatus || null,
      newbornNotes: newbornNotes || null,
      familyPlanningCounseling: !!familyPlanningCounseling,
      familyPlanningMethod: familyPlanningMethod || null,
      educationTopics: educationTopics ? JSON.stringify(educationTopics) : null,
      nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
      notes: notes || null,
      recordedById: session.user.id,
    },
    include: {
      recordedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: maternity.facilityId,
    action: "POSTNATAL_VISIT_CREATED",
    resourceType: "postnatal_visit",
    resourceId: visit.id,
    newValues: { maternityRecordId: id, visitType, maternalStatus, breastfeeding },
  });

  return NextResponse.json({ item: visit }, { status: 201 });
}
