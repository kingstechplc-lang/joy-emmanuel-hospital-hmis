// =====================================================================
// API: /api/theatre
//   GET  — list theatre case records
//   POST — create a new theatre case
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
  if (!hasPermission(session, PERMISSIONS.THEATRE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");
  const status = url.searchParams.get("status");
  const procedureType = url.searchParams.get("procedureType");

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
  if (status && status !== "all") where.status = status;
  if (procedureType && procedureType !== "all") where.procedureType = procedureType;
  if (search) {
    where.OR = [{ caseNumber: { contains: search, mode: "insensitive" } }, { patientName: { contains: search, mode: "insensitive" } }, { procedureName: { contains: search, mode: "insensitive" } }, { surgeonName: { contains: search, mode: "insensitive" } }];
  }

  const items = await db.theatreCase.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.THEATRE_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  if (!patientName || !procedureName || !scheduledStart) {
    return NextResponse.json({ error: "Missing required fields: patientName, procedureName, scheduledStart" }, { status: 400 });
  }

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }
  const year = new Date().getFullYear();
  const count = await db.theatreCase.count({ where: { organizationId: session.user.organizationId } });
  const caseNumber = `OR-${year}-${String(count + 1).padStart(6, "0")}`;

  const item = await db.theatreCase.create({
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
    action: "THEATRE_CASE_CREATED",
    resourceType: "theatreCase",
    resourceId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}
