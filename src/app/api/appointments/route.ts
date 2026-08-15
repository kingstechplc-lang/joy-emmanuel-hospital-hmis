// =====================================================================
// API: /api/appointments
//   GET  — list appointments filtered by facility/date/status
//   POST — create new appointment
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextAppointmentNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

// GET /api/appointments?facilityId=...&status=...&from=...&to=...&patientId=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.APPOINTMENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (patientId) where.patientId = patientId;
  if (from || to) {
    where.scheduledStart = {};
    if (from) where.scheduledStart.gte = new Date(from);
    if (to) where.scheduledStart.lte = new Date(to);
  }

  const appointments = await db.appointment.findMany({
    where,
    orderBy: { scheduledStart: "asc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, phone: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ items: appointments, count: appointments.length });
}

// POST /api/appointments
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.APPOINTMENT_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { patientId, facilityId, departmentId, staffId, appointmentType, scheduledStart, scheduledEnd, reason, notes } = body;

  if (!patientId || !facilityId || !scheduledStart) {
    return NextResponse.json({ error: "patientId, facilityId, scheduledStart are required" }, { status: 400 });
  }

  const appointmentNumber = await nextAppointmentNumber(facilityId);

  const appointment = await db.appointment.create({
    data: {
      patientId,
      facilityId,
      departmentId: departmentId || null,
      staffId: staffId || null,
      appointmentNumber,
      appointmentType: appointmentType || "new",
      scheduledStart: new Date(scheduledStart),
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
      status: "scheduled",
      reason: reason || null,
      notes: notes || null,
      createdById: session.user.id,
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      facility: { select: { id: true, name: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "APPOINTMENT_CREATED",
    resourceType: "appointment",
    resourceId: appointment.id,
    newValues: { appointmentNumber, patientId, scheduledStart },
  });

  return NextResponse.json({ item: appointment }, { status: 201 });
}
