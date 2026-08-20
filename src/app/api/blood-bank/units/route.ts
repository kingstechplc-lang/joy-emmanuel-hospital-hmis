// =====================================================================
// API: /api/blood-bank/units
//   GET  — list records (filter by facility, status, etc.)
//   POST — create a new record
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { notifyBloodUnitIssued } from "@/lib/workflow-notifications";

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

  // Scope to user's facilities
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

  // Apply filter params from URL (any param other than facilityId/search/limit)
  for (const [k, v] of url.searchParams.entries()) {
    if (["facilityId", "search", "limit"].includes(k)) continue;
    if (v && v !== "all") {
      if (k === "isActive") {
        where[k] = v === "true";
      } else {
        where[k] = v;
      }
    }
  }

  if (search) {
    where.OR = [
      { unitNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await db.bloodUnit.findMany({
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

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  // Validate required fields
  if (body.donorId === undefined || body.donorId === "" || body.donorId === null || body.bloodGroup === undefined || body.bloodGroup === "" || body.bloodGroup === null || body.expiryDate === undefined || body.expiryDate === "" || body.expiryDate === null) {
    return NextResponse.json({ error: "Missing required fields: donorId, bloodGroup, expiryDate" }, { status: 400 });
  }

  // Validate facility scope
  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  // Strip protected fields from body before passing to prisma.create
  const { id: _id, organizationId: _orgId, createdAt: _c, updatedAt: _u, createdById: _cb, facilityId: _fId, ...createData } = body;
  const year = new Date().getFullYear();
  const count = await db.bloodUnit.count({ where: { organizationId: session.user.organizationId } });
  const unitNumber = `BU-${year}-${String(count + 1).padStart(6, "0")}`;

  const item = await db.bloodUnit.create({
    data: {
      ...createData,
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      unitNumber,
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "BLOOD_UNIT_CREATED",
    resourceType: "bloodUnit",
    resourceId: item.id,
  });

  // 🔔 Fire workflow notification to blood bank + clinical staff
  await sendWorkflowNotification({
    event: "blood_unit_reserved",
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    title: `🩸 New Blood Unit: ${item.unitNumber}`,
    message: `${item.bloodGroup} (${item.componentType}) — ${item.volumeMl}ml. Expiry: ${new Date(item.expiryDate).toLocaleDateString()}`,
    referenceType: "blood_unit",
    referenceId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}
