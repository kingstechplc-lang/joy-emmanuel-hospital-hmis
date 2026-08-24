// =====================================================================
// API: /api/ambulance/vehicles/[id]
//   PATCH  — update vehicle (status, maintenance, details)
//   DELETE — soft-delete (set status to out_of_service)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.FLEET_MANAGE) && !hasPermission(session, PERMISSIONS.AMBULANCE_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try { const text = await req.text(); body = text && text.trim() !== "" ? JSON.parse(text) : {}; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const existing = await db.ambulanceVehicle.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowedFields = [
    "vehicleNumber", "registrationNumber", "make", "model", "year",
    "ambulanceType", "capacity", "status", "baseLocation", "notes",
    "currentOdometer", "lastServiceDate", "nextServiceDate",
    "insuranceExpiry", "roadworthinessExpiry",
  ];

  const updateData: any = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (["lastServiceDate", "nextServiceDate", "insuranceExpiry", "roadworthinessExpiry"].includes(field)) {
        updateData[field] = body[field] ? new Date(body[field]) : null;
      } else if (["year", "capacity", "currentOdometer"].includes(field)) {
        updateData[field] = body[field] ? parseInt(body[field]) : null;
      } else {
        updateData[field] = body[field];
      }
    }
  }
  if (body.equipmentProfile !== undefined) {
    updateData.equipmentProfile = body.equipmentProfile ? JSON.stringify(body.equipmentProfile) : null;
  }

  const updated = await db.ambulanceVehicle.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "AMBULANCE_VEHICLE_UPDATED",
    resourceType: "ambulance_vehicle",
    resourceId: id,
    oldValues: { status: existing.status, vehicleNumber: existing.vehicleNumber },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.FLEET_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.ambulanceVehicle.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.ambulanceVehicle.update({
    where: { id },
    data: { status: "out_of_service" },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "AMBULANCE_VEHICLE_DECOMMISSIONED",
    resourceType: "ambulance_vehicle",
    resourceId: id,
    oldValues: { vehicleNumber: existing.vehicleNumber, status: existing.status },
  });

  return NextResponse.json({ ok: true });
}
