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
    },
  });
  if (!appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  return NextResponse.json({ item: appointment });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
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
