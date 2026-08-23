// =====================================================================
// API: /api/referrals
//   GET  — list referrals (incoming/outgoing by facility) with search + filters
//   POST — create new referral (generates REF-YYYY-000001 number, records event)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { notifyReferralMade } from "@/lib/workflow-notifications";
import { nextReferralNumber, recordEvent } from "@/lib/referral-lifecycle";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/referrals?facilityId=...&direction=incoming|outgoing&status=...&search=...&urgency=...&type=...&dateFrom=...&dateTo=...&feedbackStatus=...&patientId=...&limit=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const direction = url.searchParams.get("direction"); // incoming | outgoing | all
  const status = url.searchParams.get("status");
  const urgency = url.searchParams.get("urgency");
  const referralType = url.searchParams.get("type");
  const feedbackStatus = url.searchParams.get("feedbackStatus");
  const search = url.searchParams.get("search")?.trim();
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const patientId = url.searchParams.get("patientId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  if (!facilityId) {
    return NextResponse.json({ items: [], count: 0 });
  }

  const where: any = { OR: [] };
  if (direction === "incoming") {
    where.OR = [{ receivingFacilityId: facilityId }];
  } else if (direction === "outgoing") {
    where.OR = [{ referringFacilityId: facilityId }];
  } else {
    where.OR = [
      { referringFacilityId: facilityId },
      { receivingFacilityId: facilityId },
    ];
  }

  const and: any[] = [];
  if (status && status !== "all") and.push({ status });
  if (urgency && urgency !== "all") and.push({ urgency });
  if (referralType && referralType !== "all") and.push({ referralType });
  if (feedbackStatus && feedbackStatus !== "all") and.push({ feedbackStatus });
  if (patientId) and.push({ patientIdFrom: patientId });

  // Date range filter — applied to referredAt
  if (dateFrom || dateTo) {
    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom + "T00:00:00");
    if (dateTo) dateFilter.lte = new Date(dateTo + "T23:59:59");
    and.push({ referredAt: dateFilter });
  }

  // Text search across referral number, patient name, reason, clinical summary
  if (search) {
    and.push({
      OR: [
        { referralNumber: { contains: search, mode: "insensitive" } },
        { reason: { contains: search, mode: "insensitive" } },
        { clinicalSummary: { contains: search, mode: "insensitive" } },
        { receivingFacilityName: { contains: search, mode: "insensitive" } },
        { receivingProviderName: { contains: search, mode: "insensitive" } },
        {
          patient: {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { patientNumber: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ],
    });
  }

  if (and.length > 0) where.AND = and;

  const referrals = await db.referral.findMany({
    where,
    orderBy: { referredAt: "desc" },
    take: limit,
    include: {
      patient: {
        select: {
          id: true,
          patientNumber: true,
          firstName: true,
          lastName: true,
          sex: true,
          dateOfBirth: true,
          phone: true,
        },
      },
      encounter: { select: { id: true, encounterNumber: true } },
      referringFacility: { select: { id: true, name: true, code: true } },
      receivingFacility: { select: { id: true, name: true, code: true } },
      referredBy: { select: { id: true, firstName: true, lastName: true } },
      receivedBy: { select: { id: true, firstName: true, lastName: true } },
      primaryDiagnosis: { select: { id: true, diagnosisName: true, diagnosisCode: true } },
      _count: { select: { events: true, feedback: true, messages: true } },
    },
  });

  return NextResponse.json({ items: referrals, count: referrals.length });
}

// POST /api/referrals
// Body: {
//   patientIdFrom, encounterId, referringFacilityId, receivingFacilityId?,
//   referringDepartmentId?, receivingDepartmentId?, receivingStaffId?,
//   receivingFacilityName?, receivingProviderName?, receivingContact?,
//   reason, referralReasonCategory?, clinicalSummary?, urgency, referralType?,
//   primaryDiagnosisId?, transportRequired?, stabilizationPerformed?,
//   consentStatus?, consentObtainedById?, status?
// }
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
    patientIdFrom, patientIdTo, encounterId,
    referringFacilityId, receivingFacilityId,
    referringDepartmentId, receivingDepartmentId,
    referringStaffId, receivingStaffId,
    receivingFacilityName, receivingProviderName, receivingContact,
    reason, referralReasonCategory, clinicalSummary,
    urgency, referralType, priority,
    primaryDiagnosisId,
    transportRequired, stabilizationPerformed,
    consentStatus, consentObtainedById,
    // Allow the creator to pick a starting status (default: submitted —
    // most referrals skip draft and go straight to submitted/sent)
    status: initialStatus,
  } = body;

  if (!patientIdFrom || !encounterId || !referringFacilityId) {
    return NextResponse.json(
      { error: "patientIdFrom, encounterId, referringFacilityId are required" },
      { status: 400 }
    );
  }

  if (!reason || !reason.trim()) {
    return NextResponse.json(
      { error: "A referral reason is required." },
      { status: 400 }
    );
  }

  // Generate the human-readable referral number
  const referralNumber = await nextReferralNumber(session.user.organizationId);

  const resolvedStatus = initialStatus || "submitted";
  const now = new Date();
  const timestampData: any = {};
  if (resolvedStatus === "submitted") timestampData.submittedAt = now;
  if (resolvedStatus === "sent") timestampData.sentAt = now;

  const referral = await db.referral.create({
    data: {
      referralNumber,
      referralType: referralType || "external",
      patientIdFrom,
      patientIdTo: patientIdTo || null,
      encounterId,
      referringFacilityId,
      receivingFacilityId: receivingFacilityId || null,
      referringDepartmentId: referringDepartmentId || null,
      receivingDepartmentId: receivingDepartmentId || null,
      referringStaffId: referringStaffId || session.user.id,
      receivingStaffId: receivingStaffId || null,
      receivingFacilityName: receivingFacilityName || null,
      receivingProviderName: receivingProviderName || null,
      receivingContact: receivingContact || null,
      reason,
      referralReasonCategory: referralReasonCategory || null,
      clinicalSummary: clinicalSummary || null,
      primaryDiagnosisId: primaryDiagnosisId || null,
      urgency: urgency || "routine",
      priority: priority || urgency || "routine",
      status: resolvedStatus,
      transportRequired: !!transportRequired,
      stabilizationPerformed: stabilizationPerformed || null,
      consentStatus: consentStatus || null,
      consentObtainedById: consentObtainedById || null,
      consentObtainedAt: consentStatus === "obtained" ? now : null,
      ...timestampData,
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      referringFacility: { select: { id: true, name: true } },
      receivingFacility: { select: { id: true, name: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: referringFacilityId,
    action: "REFERRAL_CREATED",
    resourceType: "referral",
    resourceId: referral.id,
    newValues: {
      referralNumber,
      patientIdFrom,
      referringFacilityId,
      receivingFacilityId,
      urgency,
      referralType,
      status: resolvedStatus,
    },
  });

  // Record the initial timeline event
  await recordEvent({
    referralId: referral.id,
    eventType: "created",
    toStatus: resolvedStatus,
    actorUserId: session.user.id,
    facilityId: referringFacilityId,
    title: `Referral ${referralNumber} created`,
    description: `Created by ${session.user.name || "user"} with status "${resolvedStatus}".`,
    metadata: { urgency, referralType, reason: reason.slice(0, 200) },
  });

  if (resolvedStatus === "sent") {
    await recordEvent({
      referralId: referral.id,
      eventType: "sent",
      fromStatus: "submitted",
      toStatus: "sent",
      actorUserId: session.user.id,
      facilityId: referringFacilityId,
      title: "Referral sent to receiving facility",
      description: `Transmitted to ${referral.receivingFacility?.name || receivingFacilityName || "receiving facility"}.`,
    });
  }

  // 🔔 Fire workflow notification to receiving facility + clinical staff
  await notifyReferralMade({
    organizationId: session.user.organizationId,
    facilityId: receivingFacilityId,
    referralNumber,
    patientName: referral.patient
      ? `${referral.patient.firstName} ${referral.patient.lastName}`
      : "Unknown",
    fromDepartment: referral.referringFacility?.name || "Referring facility",
    toDepartment: referral.receivingFacility?.name || receivingFacilityName || "Receiving facility",
    reason: reason || "Clinical referral",
    referralId: referral.id,
    referredById: session.user.id,
  });

  return NextResponse.json({ item: referral }, { status: 201 });
}
