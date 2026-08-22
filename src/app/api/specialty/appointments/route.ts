// =====================================================================
// API: /api/specialty/appointments
//   GET  — list appointments (filter by facility, date, status, department)
//   POST — create a new appointment
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { notifySpecialtyAppointmentScheduled } from "@/lib/workflow-notifications";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const departmentCode = url.searchParams.get("departmentCode");
  const status = url.searchParams.get("status");
  const date = url.searchParams.get("date"); // YYYY-MM-DD
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const patientId = url.searchParams.get("patientId");
  const limit = parseInt(url.searchParams.get("limit") || "200");

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
  if (departmentCode) where.departmentCode = departmentCode;
  if (status) where.status = status;
  if (patientId) where.patientId = patientId;
  if (date) {
    const dayStart = new Date(date + "T00:00:00");
    const dayEnd = new Date(date + "T23:59:59");
    where.appointmentDate = { gte: dayStart, lte: dayEnd };
  } else if (from || to) {
    where.appointmentDate = {};
    if (from) where.appointmentDate.gte = new Date(from);
    if (to) where.appointmentDate.lte = new Date(to);
  }

  const items = await db.specialtyAppointment.findMany({
    where,
    orderBy: [{ appointmentDate: "asc" }, { startTime: "asc" }],
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_APPOINTMENTS) && !hasPermission(session, PERMISSIONS.SPECIALTY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  if (!body.patientName || !body.departmentCode || !body.appointmentDate) {
    return NextResponse.json({ error: "Missing required fields: patientName, departmentCode, appointmentDate" }, { status: 400 });
  }

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  const { id: _id, organizationId: _orgId, createdAt: _c, updatedAt: _u, createdById: _cb, facilityId: _fId, encounterId: _eId, ...createData } = body;
  const year = new Date().getFullYear();
  const count = await db.specialtyAppointment.count({ where: { organizationId: session.user.organizationId } });
  const appointmentNumber = `SPA-${year}-${String(count + 1).padStart(6, "0")}`;

  // Normalize appointmentDate to ISO
  if (typeof createData.appointmentDate === "string") {
    createData.appointmentDate = new Date(createData.appointmentDate);
  }

  const item = await db.specialtyAppointment.create({
    data: {
      ...createData,
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,
      appointmentNumber,
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "SPECIALTY_APPOINTMENT_CREATED",
    resourceType: "specialtyAppointment",
    resourceId: item.id,
  });

  // 🔔 Fire workflow notification
  await notifySpecialtyAppointmentScheduled({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    appointmentNumber: item.appointmentNumber,
    patientName: item.patientName,
    departmentCode: item.departmentCode,
    appointmentDate: item.appointmentDate,
    startTime: item.startTime,
    clinicianId: item.clinicianId || undefined,
    appointmentId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}
