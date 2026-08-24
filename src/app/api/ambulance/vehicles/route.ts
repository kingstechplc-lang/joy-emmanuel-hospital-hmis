// =====================================================================
// API: /api/ambulance/vehicles
//   GET  — list ambulance fleet
//   POST — add ambulance to fleet
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.AMBULANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (status && status !== "all") where.status = status;

  const vehicles = await db.ambulanceVehicle.findMany({
    where,
    orderBy: { vehicleNumber: "asc" },
    include: {
      _count: { select: { trips: true } },
    },
  });

  return NextResponse.json({ items: vehicles, count: vehicles.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.FLEET_MANAGE) && !hasPermission(session, PERMISSIONS.AMBULANCE_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { vehicleNumber, registrationNumber, make, model, year, ambulanceType, capacity, facilityId,
    equipmentProfile, baseLocation, insuranceExpiry, roadworthinessExpiry, notes } = body;

  if (!vehicleNumber || !registrationNumber || !facilityId) {
    return NextResponse.json({ error: "vehicleNumber, registrationNumber, and facilityId are required" }, { status: 400 });
  }

  // Duplicate check
  const existing = await db.ambulanceVehicle.findFirst({
    where: { organizationId: session.user.organizationId, vehicleNumber: { equals: vehicleNumber, mode: "insensitive" } },
  });
  if (existing) {
    return NextResponse.json({ error: `Vehicle with number "${vehicleNumber}" already exists`, code: "DUPLICATE" }, { status: 409 });
  }

  const vehicle = await db.ambulanceVehicle.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId,
      vehicleNumber,
      registrationNumber,
      make: make || null,
      model: model || null,
      year: year || null,
      ambulanceType: ambulanceType || "basic_life_support",
      capacity: capacity || 2,
      status: "available",
      equipmentProfile: equipmentProfile ? JSON.stringify(equipmentProfile) : null,
      baseLocation: baseLocation || null,
      insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : null,
      roadworthinessExpiry: roadworthinessExpiry ? new Date(roadworthinessExpiry) : null,
      notes: notes || null,
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "AMBULANCE_VEHICLE_CREATED",
    resourceType: "ambulance_vehicle",
    resourceId: vehicle.id,
    newValues: { vehicleNumber, registrationNumber, ambulanceType },
  });

  return NextResponse.json({ item: vehicle }, { status: 201 });
}
