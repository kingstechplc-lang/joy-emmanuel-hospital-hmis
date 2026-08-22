// =====================================================================
// API: /api/blood-bank/crossmatch
//   GET  — list crossmatch tests
//   POST — create a crossmatch test
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
  const status = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");

  const orgFacilities = await db.facility.findMany({ where: { organizationId: session.user.organizationId }, select: { id: true } });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) where.facilityId = facilityId;
  else where.facilityId = { in: orgFacilityIds };
  if (status && status !== "all") where.crossmatchResult = status;
  if (patientId) where.patientId = patientId;
  if (search) {
    where.OR = [
      { crossmatchNumber: { contains: search, mode: "insensitive" } },
      { patientName: { contains: search, mode: "insensitive" } },
      { unitNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await db.bloodCrossmatch.findMany({
    where,
    orderBy: { testedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BLOODBANK_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: any;
  try { const text = await req.text(); body = text ? JSON.parse(text) : {}; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { patientName, unitId } = body;
  if (!patientName || !unitId) return NextResponse.json({ error: "patientName and unitId are required" }, { status: 400 });

  // Get the blood unit
  const unit = await db.bloodUnit.findUnique({ where: { id: unitId } });
  if (!unit || unit.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Blood unit not found" }, { status: 404 });
  }

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  }

  const count = await db.bloodCrossmatch.count({ where: { organizationId: session.user.organizationId } });
  const year = new Date().getFullYear();
  const crossmatchNumber = `XM-${year}-${String(count + 1).padStart(6, "0")}`;

  const { id: _id, organizationId: _org, createdAt: _c, updatedAt: _u, facilityId: _f, crossmatchNumber: _xn, unitNumber: _un, donorBloodGroup: _dbg, ...createData } = body;

  const item = await db.bloodCrossmatch.create({
    data: {
      ...createData,
      crossmatchNumber,
      unitId,
      unitNumber: unit.unitNumber,
      donorBloodGroup: unit.bloodGroup,
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      testedBy: session.user.name || session.user.username,
    },
  });

  // If compatible, auto-reserve the unit
  if (createData.crossmatchResult === "compatible" && unit.status === "available") {
    await db.bloodUnit.update({
      where: { id: unitId },
      data: {
        status: "reserved",
        reservedForPatientId: createData.patientId || null,
        reservedForPatientName: patientName,
      },
    });
  }

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "BLOOD_CROSSMATCH_CREATED", resourceType: "blood_crossmatch", resourceId: item.id });
  return NextResponse.json({ item }, { status: 201 });
}
