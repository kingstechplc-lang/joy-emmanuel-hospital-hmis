// =====================================================================
// API: /api/blood-bank/donors
//   GET  — list donor records
//   POST — create a new donor
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BLOODBANK_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");
  const bloodGroup = url.searchParams.get("bloodGroup");
  const eligibilityStatus = url.searchParams.get("eligibilityStatus");

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
  if (bloodGroup && bloodGroup !== "all") where.bloodGroup = bloodGroup;
  if (eligibilityStatus && eligibilityStatus !== "all") where.eligibilityStatus = eligibilityStatus;
  if (search) {
    where.OR = [{ fullName: { contains: search, mode: "insensitive" } }, { donorNumber: { contains: search, mode: "insensitive" } }, { phone: { contains: search, mode: "insensitive" } }, { bloodGroup: { contains: search, mode: "insensitive" } }];
  }

  const items = await db.bloodDonor.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BLOODBANK_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  if (!fullName) {
    return NextResponse.json({ error: "Missing required fields: fullName" }, { status: 400 });
  }

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }
  const year = new Date().getFullYear();
  const count = await db.bloodDonor.count({ where: { organizationId: session.user.organizationId } });
  const donorNumber = `DON-${year}-${String(count + 1).padStart(6, "0")}`;

  const item = await db.bloodDonor.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      donorNumber,
      ...body,
      facilityId: resolvedFacilityId,
      organizationId: session.user.organizationId,
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "BLOOD_DONOR_CREATED",
    resourceType: "bloodDonor",
    resourceId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}
