// =====================================================================
// API: /api/mortuary
//   GET  — list mortuary admissions (filter by facility, status, etc.)
//   POST — create a new mortuary admission (deceased person intake)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { notifyMortuaryAdmission } from "@/lib/workflow-notifications";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MORTUARY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");
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
  if (status && status !== "all") where.admissionStatus = status;
  if (search) {
    where.OR = [
      { deceasedName: { contains: search, mode: "insensitive" } },
      { admissionNumber: { contains: search, mode: "insensitive" } },
      { bodyTag: { contains: search, mode: "insensitive" } },
      { nationalId: { contains: search, mode: "insensitive" } },
      { nextOfKinName: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await db.mortuaryAdmission.findMany({
    where,
    orderBy: [{ admittedAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MORTUARY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    facilityId, patientId, deceasedName, deceasedAge, deceasedSex, deceasedDob,
    nationalId, nextOfKinName, nextOfKinPhone, nextOfKinRelation,
    dateOfDeath, placeOfDeath, causeOfDeath, deathCertificateNo,
    broughtBy, broughtByPhone, sourceFacility, sourceNotes,
    storageUnitId, storageLocation, bodyTag,
  } = body;

  if (!deceasedName || !dateOfDeath) {
    return NextResponse.json({ error: "deceasedName and dateOfDeath are required" }, { status: 400 });
  }

  let resolvedFacilityId = facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  // Generate admission number
  const year = new Date().getFullYear();
  const count = await db.mortuaryAdmission.count({ where: { organizationId: session.user.organizationId } });
  const admissionNumber = `MRT-${year}-${String(count + 1).padStart(6, "0")}`;

  const finalBodyTag = bodyTag || `BT-${year}-${String(count + 1).padStart(5, "0")}`;

  const item = await db.mortuaryAdmission.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      admissionNumber,
      patientId: patientId || null,
      deceasedName,
      deceasedAge: deceasedAge || null,
      deceasedSex: deceasedSex || null,
      deceasedDob: deceasedDob ? new Date(deceasedDob) : null,
      nationalId: nationalId || null,
      nextOfKinName: nextOfKinName || null,
      nextOfKinPhone: nextOfKinPhone || null,
      nextOfKinRelation: nextOfKinRelation || null,
      dateOfDeath: new Date(dateOfDeath),
      placeOfDeath: placeOfDeath || null,
      causeOfDeath: causeOfDeath || null,
      deathCertificateNo: deathCertificateNo || null,
      broughtBy: broughtBy || null,
      broughtByPhone: broughtByPhone || null,
      sourceFacility: sourceFacility || null,
      sourceNotes: sourceNotes || null,
      storageUnitId: storageUnitId || null,
      storageLocation: storageLocation || null,
      bodyTag: finalBodyTag,
      admissionStatus: "admitted",
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "MORTUARY_ADMISSION_CREATED",
    resourceType: "mortuary_admission",
    resourceId: item.id,
    newValues: { admissionNumber, deceasedName, placeOfDeath: placeOfDeath || null },
  });

  // 🔔 Fire workflow notification to mortuary staff
  await notifyMortuaryAdmission({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    admissionNumber,
    deceasedName,
    placeOfDeath: placeOfDeath || "unknown",
    causeOfDeath: causeOfDeath || undefined,
    mortuaryId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}
