// =====================================================================
// API: /api/referrals
//   GET  — list referrals (incoming/outgoing by facility)
//   POST — create new referral
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

// GET /api/referrals?facilityId=...&direction=incoming|outgoing&status=...
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
  const patientId = url.searchParams.get("patientId");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  if (!facilityId) {
    return NextResponse.json({ items: [], count: 0 });
  }

  const where: any = { OR: [] };
  if (direction === "incoming") {
    where.OR = [{ receivingFacilityId: facilityId }];
  } else if (direction === "outgoing") {
    where.OR = [{ referringFacilityId: facilityId }];
  } else {
    where.OR = [{ referringFacilityId: facilityId }, { receivingFacilityId: facilityId }];
  }
  if (status) where.AND = [...(where.AND || []), { status }];
  if (patientId) where.AND = [...(where.AND || []), { patientIdFrom: patientId }];

  const referrals = await db.referral.findMany({
    where,
    orderBy: { referredAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } },
      encounter: { select: { id: true, encounterNumber: true } },
      referringFacility: { select: { id: true, name: true, code: true } },
      receivingFacility: { select: { id: true, name: true, code: true } },
      referredBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: referrals, count: referrals.length });
}

// POST /api/referrals
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    patientIdFrom, patientIdTo, encounterId,
    referringFacilityId, receivingFacilityId,
    referringDepartmentId, receivingDepartmentId,
    referringStaffId, receivingStaffId,
    reason, clinicalSummary, urgency,
  } = body;

  if (!patientIdFrom || !encounterId || !referringFacilityId) {
    return NextResponse.json({ error: "patientIdFrom, encounterId, referringFacilityId are required" }, { status: 400 });
  }

  const referral = await db.referral.create({
    data: {
      patientIdFrom,
      patientIdTo: patientIdTo || null,
      encounterId,
      referringFacilityId,
      receivingFacilityId: receivingFacilityId || null,
      referringDepartmentId: referringDepartmentId || null,
      receivingDepartmentId: receivingDepartmentId || null,
      referringStaffId: referringStaffId || session.user.id,
      receivingStaffId: receivingStaffId || null,
      reason: reason || null,
      clinicalSummary: clinicalSummary || null,
      urgency: urgency || "routine",
      status: "pending",
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
    newValues: { patientIdFrom, referringFacilityId, receivingFacilityId, urgency },
  });

  return NextResponse.json({ item: referral }, { status: 201 });
}
