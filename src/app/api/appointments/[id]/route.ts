// =====================================================================
// API: /api/appointments/[id]
//   GET   — single appointment
//   PATCH — status transitions (confirm, cancel, no_show, complete, reschedule)
//   DELETE — cancel appointment
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.APPOINTMENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const appointment = await db.appointment.findUnique({
    where: { id },
    include: {
      patient: true,
      facility: true,
      department: true,
      history: { orderBy: { changedAt: "desc" } },
    },
  });
  if (!appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  return NextResponse.json({ item: appointment });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { status, scheduledStart, scheduledEnd, reason, notes } = body;

  const existing = await db.appointment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  // Permission gating by action type
  if (status === "cancelled" && !hasPermission(session, PERMISSIONS.APPOINTMENT_CANCEL)) {
    return NextResponse.json({ error: "Missing appointment.cancel permission" }, { status: 403 });
  }
  if ((scheduledStart || scheduledEnd) && !hasPermission(session, PERMISSIONS.APPOINTMENT_RESCHEDULE)) {
    return NextResponse.json({ error: "Missing appointment.reschedule permission" }, { status: 403 });
  }
  if (!hasPermission(session, PERMISSIONS.APPOINTMENT_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: any = {};
  if (status) data.status = status;
  if (scheduledStart) data.scheduledStart = new Date(scheduledStart);
  if (scheduledEnd) data.scheduledEnd = new Date(scheduledEnd);
  if (reason !== undefined) data.reason = reason;
  if (notes !== undefined) data.notes = notes;

  const updated = await db.appointment.update({ where: { id }, data });

  // Record appointment history
  let action = "modified";
  if (status === "confirmed") action = "confirmed";
  else if (status === "cancelled") action = "cancelled";
  else if (status === "checked_in") action = "checked_in";
  else if (status === "completed") action = "completed";
  else if (status === "no_show") action = "no_show";
  else if (scheduledStart) action = "rescheduled";

  await db.appointmentHistory.create({
    data: {
      appointmentId: id,
      action,
      fromStatus: existing.status,
      toStatus: status || existing.status,
      fromDateTime: scheduledStart ? existing.scheduledStart : null,
      toDateTime: scheduledStart ? new Date(scheduledStart) : null,
      reason: reason || null,
      changedById: session.user.id,
      changedByName: session.user.name || undefined,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "APPOINTMENT_UPDATED",
    resourceType: "appointment",
    resourceId: id,
    oldValues: { status: existing.status, scheduledStart: existing.scheduledStart },
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.APPOINTMENT_CANCEL)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.appointment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.appointment.update({
    where: { id },
    data: { status: "cancelled" },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "APPOINTMENT_CANCELLED",
    resourceType: "appointment",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: { status: "cancelled" },
  });

  return NextResponse.json({ item: updated });
}
