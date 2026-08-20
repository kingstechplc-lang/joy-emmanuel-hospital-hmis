// =====================================================================
// API: /api/coding-records
//   GET  — list coding record records
//   POST — create a new coding record
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
  if (!hasPermission(session, PERMISSIONS.CODING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");
  const codingType = url.searchParams.get("codingType");
  const claimStatus = url.searchParams.get("claimStatus");

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
  if (codingType && codingType !== "all") where.codingType = codingType;
  if (claimStatus && claimStatus !== "all") where.claimStatus = claimStatus;
  if (search) {
    where.OR = [{ patientName: { contains: search, mode: "insensitive" } }, { primaryCode: { contains: search, mode: "insensitive" } }, { primaryDescription: { contains: search, mode: "insensitive" } }];
  }

  const items = await db.codingRecord.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CODING_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  if (!patientName || !primaryCode || !primaryDescription) {
    return NextResponse.json({ error: "Missing required fields: patientName, primaryCode, primaryDescription" }, { status: 400 });
  }

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }


  const item = await db.codingRecord.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
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
    action: "CODING_RECORD_CREATED",
    resourceType: "codingRecord",
    resourceId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}
