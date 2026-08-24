// =====================================================================
// API: /api/ambulance/[id]
//   GET    — single trip with full details
//   PATCH  — update trip (dispatch, status changes, assign vehicle/driver, complete)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const STATUS_TIMESTAMPS: Record<string, string> = {
  dispatched: "dispatchedAt",
  en_route_pickup: "departedAt",
  at_pickup: "arrivedAtPickupAt",
  patient_on_board: "patientOnBoardAt",
  en_route_destination: "departedPickupAt",
  at_destination: "arrivedAtDestinationAt",
  handover: "handoverAt",
  returning: "returnedAt",
  completed: "completedAt",
  cancelled: "cancelledAt",
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.AMBULANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const trip = await db.ambulanceTrip.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true } },
      vehicle: true,
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      incidents: { orderBy: { reportedAt: "desc" } },
    },
  });

  if (!trip || trip.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ item: trip });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.AMBULANCE_DISPATCH) && !hasPermission(session, PERMISSIONS.AMBULANCE_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const existing = await db.ambulanceTrip.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { status, vehicleId, driverStaffId, crewIds, cancellationReason, handoverNotes, handoverReceivedById,
    startMileage, endMileage, distance, notes, billingStatus, invoiceId, serviceId } = body;

  const updateData: any = {};

  // Status change with timestamp
  if (status && status !== existing.status) {
    updateData.status = status;
    const tsField = STATUS_TIMESTAMPS[status];
    if (tsField) updateData[tsField] = new Date();
    if (status === "dispatched" && !existing.dispatchedById) {
      updateData.dispatchedById = session.user.id;
    }
    if (status === "cancelled") {
      updateData.cancellationReason = cancellationReason || "No reason provided";
    }
  }

  // Assignment
  if (vehicleId !== undefined) {
    updateData.vehicleId = vehicleId || null;
    // Update vehicle status when assigned
    if (vehicleId) {
      const vehicle = await db.ambulanceVehicle.findUnique({ where: { id: vehicleId } });
      if (vehicle && vehicle.status === "available") {
        await db.ambulanceVehicle.update({
          where: { id: vehicleId },
          data: { status: status === "completed" || status === "cancelled" ? "available" : "dispatched" },
        });
      }
    }
  }
  if (driverStaffId !== undefined) updateData.driverStaffId = driverStaffId || null;
  if (crewIds !== undefined) updateData.crewIds = crewIds ? JSON.stringify(crewIds) : null;

  // Trip details
  if (startMileage !== undefined) updateData.startMileage = startMileage;
  if (endMileage !== undefined) updateData.endMileage = endMileage;
  if (distance !== undefined) updateData.distance = distance;
  if (handoverNotes !== undefined) updateData.handoverNotes = handoverNotes;
  if (handoverReceivedById !== undefined) updateData.handoverReceivedById = handoverReceivedById;
  if (notes !== undefined) updateData.notes = notes;
  if (billingStatus !== undefined) updateData.billingStatus = billingStatus;
  if (invoiceId !== undefined) updateData.invoiceId = invoiceId;
  if (serviceId !== undefined) updateData.serviceId = serviceId;
  if (cancellationReason !== undefined) updateData.cancellationReason = cancellationReason;

  const updated = await db.ambulanceTrip.update({ where: { id }, data: updateData });

  // When trip completes, set vehicle back to available
  if (status === "completed" && existing.vehicleId) {
    await db.ambulanceVehicle.update({
      where: { id: existing.vehicleId },
      data: { status: "available" },
    });
  }
  if (status === "cancelled" && existing.vehicleId) {
    await db.ambulanceVehicle.update({
      where: { id: existing.vehicleId },
      data: { status: "available" },
    });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: status ? `AMBULANCE_TRIP_${status.toUpperCase()}` : "AMBULANCE_TRIP_UPDATED",
    resourceType: "ambulance_trip",
    resourceId: id,
    oldValues: { status: existing.status, vehicleId: existing.vehicleId, driverStaffId: existing.driverStaffId },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}
