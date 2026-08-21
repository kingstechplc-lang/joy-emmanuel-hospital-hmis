// =====================================================================
// API: /api/record-requests
//   GET  — list record requests (filter by status, priority, facility)
//   POST — create a new record request
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
  if (!hasPermission(session, PERMISSIONS.PATIENT_VIEW) && !hasPermission(session, PERMISSIONS.ENCOUNTER_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) where.facilityId = facilityId;
  else where.facilityId = { in: orgFacilityIds };
  if (status && status !== "all") where.status = status;
  if (priority && priority !== "all") where.priority = priority;
  if (search) {
    where.OR = [
      { patientName: { contains: search, mode: "insensitive" } },
      { patientNumber: { contains: search, mode: "insensitive" } },
      { requestNumber: { contains: search, mode: "insensitive" } },
      { requestingDepartment: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await db.recordRequest.findMany({
    where,
    orderBy: { requestedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { patientName } = body;
  if (!patientName) {
    return NextResponse.json({ error: "patientName is required" }, { status: 400 });
  }

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  const count = await db.recordRequest.count({ where: { organizationId: session.user.organizationId } });
  const year = new Date().getFullYear();
  const requestNumber = `RR-${year}-${String(count + 1).padStart(6, "0")}`;

  const { id: _id, organizationId: _org, createdAt: _c, updatedAt: _u, createdById: _cb, requestNumber: _rn, facilityId: _f, ...createData } = body;

  const item = await db.recordRequest.create({
    data: {
      ...createData,
      requestNumber,
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      createdById: session.user.id,
    },
  });

  // Create initial movement record
  await db.recordMovement.create({
    data: {
      recordRequestId: item.id,
      patientId: item.patientId,
      patientName: item.patientName,
      patientNumber: item.patientNumber,
      movementType: "requested",
      toLocation: "Records Desk",
      departmentCode: item.requestingDepartment,
      staffName: session.user.name,
      notes: `Request created: ${item.purpose || "Record retrieval"}`,
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "RECORD_REQUEST_CREATED",
    resourceType: "record_request",
    resourceId: item.id,
    newValues: { requestNumber, patientName },
  });

  return NextResponse.json({ item }, { status: 201 });
}
