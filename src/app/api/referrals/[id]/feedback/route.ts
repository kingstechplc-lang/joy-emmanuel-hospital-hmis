// =====================================================================
// API: /api/referrals/[id]/feedback
//   GET  — list all feedback entries (interim + final) for a referral
//   POST — submit new feedback (counter-referral from receiving facility)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { recordEvent } from "@/lib/referral-lifecycle";
import { notifyReferralFeedbackReceived } from "@/lib/workflow-notifications";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const referral = await db.referral.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!referral) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const feedback = await db.referralFeedback.findMany({
    where: { referralId: id },
    orderBy: { createdAt: "desc" },
    include: {
      authorUser: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: feedback, count: feedback.length });
}

// POST /api/referrals/[id]/feedback
// Body: {
//   feedbackType, clinicalFindings?, diagnosis?, treatmentProvided?,
//   proceduresPerformed?, investigationsDone?, outcome?, medicationsPrescribed?,
//   recommendations?, followUpPlan?, returnRecommendation?, isFinal?
// }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_EDIT)) {
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

  const {
    feedbackType,
    clinicalFindings,
    diagnosis,
    treatmentProvided,
    proceduresPerformed,
    investigationsDone,
    outcome,
    medicationsPrescribed,
    recommendations,
    followUpPlan,
    returnRecommendation,
    isFinal,
  } = body;

  if (!feedbackType) {
    return NextResponse.json({ error: "feedbackType is required" }, { status: 400 });
  }

  const referral = await db.referral.findUnique({
    where: { id },
    select: {
      id: true,
      referralNumber: true,
      status: true,
      feedbackStatus: true,
      referringFacilityId: true,
      receivingFacilityId: true,
      patient: { select: { firstName: true, lastName: true } },
      receivingFacility: { select: { name: true } },
    },
  });
  if (!referral) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const feedback = await db.referralFeedback.create({
    data: {
      referralId: id,
      feedbackType,
      authorUserId: session.user.id,
      authorFacilityId: session.user.facilityId,
      clinicalFindings: clinicalFindings || null,
      diagnosis: diagnosis || null,
      treatmentProvided: treatmentProvided || null,
      proceduresPerformed: proceduresPerformed || null,
      investigationsDone: investigationsDone || null,
      outcome: outcome || null,
      medicationsPrescribed: medicationsPrescribed || null,
      recommendations: recommendations || null,
      followUpPlan: followUpPlan || null,
      returnRecommendation: returnRecommendation || null,
      isFinal: !!isFinal,
    },
    include: {
      authorUser: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // Update referral status based on feedback
  const updateData: any = {
    feedbackStatus: "received",
    feedbackReceivedAt: new Date(),
  };
  // If this is final feedback, advance the referral lifecycle
  if (isFinal) {
    if (referral.status === "completed") {
      updateData.status = "feedback_received";
    }
    if (outcome) {
      // Keep status as feedback_received — closure is a separate action
    }
  }

  await db.referral.update({ where: { id }, data: updateData });

  await recordEvent({
    referralId: id,
    eventType: "feedback_received",
    fromStatus: referral.status,
    toStatus: updateData.status || referral.status,
    actorUserId: session.user.id,
    facilityId: session.user.facilityId,
    title: `${feedbackType} feedback submitted`,
    description: outcome
      ? `Outcome: ${outcome}. ${recommendations ? `Recommendations: ${recommendations.slice(0, 150)}` : ""}`
      : `Feedback submitted by ${session.user.name || "user"}.`,
    metadata: { feedbackType, outcome, isFinal },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "REFERRAL_FEEDBACK_SUBMITTED",
    resourceType: "referral",
    resourceId: id,
    newValues: { feedbackType, outcome, isFinal },
  });

  // Notify the referring facility that feedback was received
  const patientName = referral.patient
    ? `${referral.patient.firstName} ${referral.patient.lastName}`
    : "Unknown";
  await notifyReferralFeedbackReceived({
    organizationId: session.user.organizationId,
    facilityId: referral.referringFacilityId,
    referralNumber: referral.referralNumber || id.slice(-8).toUpperCase(),
    patientName,
    receivingFacilityName: referral.receivingFacility?.name || "Receiving facility",
    referralId: id,
    feedbackType,
    outcome,
  });

  return NextResponse.json({ item: feedback }, { status: 201 });
}
