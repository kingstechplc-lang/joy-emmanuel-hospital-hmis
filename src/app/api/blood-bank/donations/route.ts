// =====================================================================
// API: /api/blood-bank/donations
//   GET  — list donations
//   POST — create a donation record
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
  if (!hasPermission(session, PERMISSIONS.BLOODBANK_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const donorId = url.searchParams.get("donorId");
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");

  const orgFacilities = await db.facility.findMany({ where: { organizationId: session.user.organizationId }, select: { id: true } });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) where.facilityId = facilityId;
  else where.facilityId = { in: orgFacilityIds };
  if (donorId) where.donorId = donorId;
  if (status && status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { donationNumber: { contains: search, mode: "insensitive" } },
      { donor: { fullName: { contains: search, mode: "insensitive" } } },
    ];
  }

  const items = await db.bloodDonation.findMany({
    where,
    orderBy: { collectionDate: "desc" },
    take: limit,
    include: { donor: { select: { fullName: true, donorNumber: true, bloodGroup: true } } },
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BLOODBANK_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: any;
  try { const text = await req.text(); body = text ? JSON.parse(text) : {}; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { donorId, bloodGroup } = body;
  if (!donorId || !bloodGroup) return NextResponse.json({ error: "donorId and bloodGroup are required" }, { status: 400 });

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  }

  const count = await db.bloodDonation.count({ where: { organizationId: session.user.organizationId } });
  const year = new Date().getFullYear();
  const donationNumber = `BD-${year}-${String(count + 1).padStart(6, "0")}`;

  const { id: _id, organizationId: _org, createdAt: _c, updatedAt: _u, createdById: _cb, facilityId: _f, donationNumber: _dn, ...createData } = body;

  // Convert dates
  if (createData.collectionDate) { try { createData.collectionDate = new Date(createData.collectionDate); } catch {} }

  const item = await db.bloodDonation.create({
    data: {
      ...createData,
      donationNumber,
      donorId,
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      collectedById: session.user.id,
      collectedByName: session.user.name || session.user.username,
    },
    include: { donor: { select: { fullName: true, donorNumber: true } } },
  });

  // Update donor's last donation + count
  await db.bloodDonor.update({
    where: { id: donorId },
    data: {
      lastDonationAt: new Date(),
      donationCount: { increment: 1 },
    },
  });

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "BLOOD_DONATION_CREATED", resourceType: "blood_donation", resourceId: item.id });
  return NextResponse.json({ item }, { status: 201 });
}
