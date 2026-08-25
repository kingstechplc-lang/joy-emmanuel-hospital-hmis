// =====================================================================
// API: /api/ambulance
//   GET  — list ambulance trips (with search + filters)
//   POST — create ambulance request/trip
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
  const priority = url.searchParams.get("priority");
  const requestType = url.searchParams.get("requestType");
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status && status !== "all") where.status = status;
  if (priority && priority !== "all") where.priority = priority;
  if (requestType && requestType !== "all") where.requestType = requestType;

  if (q) {
    where.OR = [
      { tripNumber: { contains: q, mode: "insensitive" } },
      { pickupLocation: { contains: q, mode: "insensitive" } },
      { destinationLocation: { contains: q, mode: "insensitive" } },
      { reasonForTransport: { contains: q, mode: "insensitive" } },
      { patient: { OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { patientNumber: { contains: q, mode: "insensitive" } },
      ]}},
    ];
  }

  const trips = await db.ambulanceTrip.findMany({
    where,
    orderBy: { requestedAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true } },
      vehicle: { select: { id: true, vehicleNumber: true, registrationNumber: true, ambulanceType: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { incidents: true } },
    },
  });

  return NextResponse.json({ items: trips, count: trips.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.AMBULANCE_DISPATCH) && !hasPermission(session, PERMISSIONS.AMBULANCE_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const facilityId = body.facilityId || session.user.facilityId;
  if (!facilityId) return NextResponse.json({ error: "facilityId is required" }, { status: 400 });

  // Generate trip number
  const year = new Date().getFullYear();
  const count = await db.ambulanceTrip.count({ where: { organizationId: session.user.organizationId } });
  const tripNumber = `AMB-TRIP-${year}-${String(count + 1).padStart(6, "0")}`;

  const trip = await db.ambulanceTrip.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId,
      tripNumber,
      patientId: body.patientId || null,
      referralId: body.referralId || null,
      serviceRequestId: body.serviceRequestId || null,
      requestType: body.requestType || "emergency",
      priority: body.priority || "urgent",
      pickupLocation: body.pickupLocation || "—",
      pickupFacilityId: body.pickupFacilityId || null,
      pickupContactName: body.pickupContactName || null,
      pickupContactPhone: body.pickupContactPhone || null,
      pickupNotes: body.pickupNotes || null,
      destinationLocation: body.destinationLocation || "—",
      destinationFacilityId: body.destinationFacilityId || null,
      destinationDepartment: body.destinationDepartment || null,
      destinationContactName: body.destinationContactName || null,
      destinationContactPhone: body.destinationContactPhone || null,
      reasonForTransport: body.reasonForTransport || null,
      clinicalIndication: body.clinicalIndication || null,
      patientCondition: body.patientCondition || null,
      mobilityRequirement: body.mobilityRequirement || null,
      oxygenRequired: !!body.oxygenRequired,
      accompanyingPerson: body.accompanyingPerson || null,
      specialRequirements: body.specialRequirements || null,
      requestedDepartureAt: body.requestedDepartureAt ? new Date(body.requestedDepartureAt) : null,
      status: "requested",
      requestedById: session.user.id,
      notes: body.notes || null,
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "AMBULANCE_REQUEST_CREATED",
    resourceType: "ambulance_trip",
    resourceId: trip.id,
    newValues: { tripNumber, requestType: body.requestType, priority: body.priority, pickupLocation: body.pickupLocation, destinationLocation: body.destinationLocation },
  });

  return NextResponse.json({ item: trip }, { status: 201 });
}
