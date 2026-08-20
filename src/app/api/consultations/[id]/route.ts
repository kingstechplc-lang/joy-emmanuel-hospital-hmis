// =====================================================================
// API: /api/consultations/[id]
//   GET   — single consultation
//   PATCH — update fields OR "sign" action (sets signedById/signedAt, status=signed)
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
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const consultation = await db.consultation.findUnique({
    where: { id },
    include: {
      patient: true,
      encounter: { include: { facility: true } },
      clinician: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!consultation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item: consultation });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { action } = body;

  const existing = await db.consultation.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Sign action requires clinical.sign permission
  if (action === "sign") {
    if (!hasPermission(session, PERMISSIONS.CLINICAL_SIGN)) {
      return NextResponse.json({ error: "Missing clinical.sign permission" }, { status: 403 });
    }
    if (existing.status === "signed") {
      return NextResponse.json({ error: "Consultation is already signed" }, { status: 400 });
    }
    const updated = await db.consultation.update({
      where: { id },
      data: {
        status: "signed",
        signedById: session.user.id,
        signedAt: new Date(),
      },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: session.user.facilityId || undefined,
      action: "CONSULTATION_SIGNED",
      resourceType: "consultation",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "signed", signedById: session.user.id },
    });
    return NextResponse.json({ item: updated });
  }

  // Amendment requires clinical.amend
  if (existing.status === "signed" && !hasPermission(session, PERMISSIONS.CLINICAL_AMEND)) {
    return NextResponse.json({ error: "Cannot edit signed consultation without clinical.amend permission" }, { status: 403 });
  }

  if (!hasPermission(session, PERMISSIONS.CLINICAL_EDIT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const {
    chiefComplaint, historyPresentingIllness,
    pastMedicalHistory, pastSurgicalHistory, medicationHistory,
    familyHistory, socialHistory, reviewOfSystems,
    physicalExamination, assessment, treatmentPlan, followUpPlan,
    clinicianId,
  } = body;

  const data: any = {};
  if (chiefComplaint !== undefined) data.chiefComplaint = chiefComplaint;
  if (historyPresentingIllness !== undefined) data.historyPresentingIllness = historyPresentingIllness;
  if (pastMedicalHistory !== undefined) data.pastMedicalHistory = pastMedicalHistory;
  if (pastSurgicalHistory !== undefined) data.pastSurgicalHistory = pastSurgicalHistory;
  if (medicationHistory !== undefined) data.medicationHistory = medicationHistory;
  if (familyHistory !== undefined) data.familyHistory = familyHistory;
  if (socialHistory !== undefined) data.socialHistory = socialHistory;
  if (reviewOfSystems !== undefined) data.reviewOfSystems = reviewOfSystems;
  if (physicalExamination !== undefined) data.physicalExamination = physicalExamination;
  if (assessment !== undefined) data.assessment = assessment;
  if (treatmentPlan !== undefined) data.treatmentPlan = treatmentPlan;
  if (followUpPlan !== undefined) data.followUpPlan = followUpPlan;
  if (clinicianId !== undefined) data.clinicianId = clinicianId;

  // If amending a signed consultation, mark as amended
  if (existing.status === "signed") {
    data.status = "amended";
  }

  const updated = await db.consultation.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "CONSULTATION_UPDATED",
    resourceType: "consultation",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}
