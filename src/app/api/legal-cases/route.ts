// =====================================================================
// API: /api/legal-cases
//   GET  — list legal case records
//   POST — create a new legal case
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
  if (!hasPermission(session, PERMISSIONS.LEGAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");
  const caseType = url.searchParams.get("caseType");
  const status = url.searchParams.get("status");

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
  if (caseType && caseType !== "all") where.caseType = caseType;
  if (status && status !== "all") where.status = status;
  if (search) {
    where.OR = [{ caseNumber: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }, { plaintiffName: { contains: search, mode: "insensitive" } }, { defendantName: { contains: search, mode: "insensitive" } }];
  }

  const items = await db.legalCase.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEGAL_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  if (!caseType || !title) {
    return NextResponse.json({ error: "Missing required fields: caseType, title" }, { status: 400 });
  }

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }
  const year = new Date().getFullYear();
  const count = await db.legalCase.count({ where: { organizationId: session.user.organizationId } });
  const caseNumber = `LEG-${year}-${String(count + 1).padStart(6, "0")}`;

  const item = await db.legalCase.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      caseNumber,
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
    action: "LEGAL_CASE_CREATED",
    resourceType: "legalCase",
    resourceId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}
