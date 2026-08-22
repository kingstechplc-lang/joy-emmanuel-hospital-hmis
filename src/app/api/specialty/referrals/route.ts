// =====================================================================
// API: /api/specialty/referrals
//   GET  — list referrals (filter by facility, status, toDepartmentCode)
//   POST — create a new referral
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { notifySpecialtyReferralReceived } from "@/lib/workflow-notifications";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const toDepartmentCode = url.searchParams.get("toDepartmentCode");
  const status = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");
  const limit = parseInt(url.searchParams.get("limit") || "200");

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) {
    where.facilityId = facilityId;
  } else {
    where.facilityId = { in: orgFacilityIds };
  }
  if (toDepartmentCode) where.toDepartmentCode = toDepartmentCode;
  if (status) where.status = status;
  if (patientId) where.patientId = patientId;

  const items = await db.specialtyReferral.findMany({
    where,
    orderBy: [{ referralDate: "desc" }],
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_REFERRALS) && !hasPermission(session, PERMISSIONS.SPECIALTY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  if (!body.patientName || !body.toDepartmentCode || !body.reason) {
    return NextResponse.json({ error: "Missing required fields: patientName, toDepartmentCode, reason" }, { status: 400 });
  }

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  const { id: _id, organizationId: _orgId, createdAt: _c, updatedAt: _u, createdById: _cb, facilityId: _fId, encounterId: _eId, responseDate: _rd, ...createData } = body;
  const year = new Date().getFullYear();
  const count = await db.specialtyReferral.count({ where: { organizationId: session.user.organizationId } });
  const referralNumber = `SPR-${year}-${String(count + 1).padStart(6, "0")}`;

  const item = await db.specialtyReferral.create({
    data: {
      ...createData,
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      referralNumber,
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "SPECIALTY_REFERRAL_CREATED",
    resourceType: "specialtyReferral",
    resourceId: item.id,
  });

  // 🔔 Fire workflow notification to the receiving specialty team
  await notifySpecialtyReferralReceived({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    referralNumber: item.referralNumber,
    patientName: item.patientName,
    toDepartmentCode: item.toDepartmentCode,
    fromDepartment: item.fromDepartment,
    reason: item.reason,
    urgency: item.urgency,
    referralId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}
