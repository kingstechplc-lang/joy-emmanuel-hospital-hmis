// =====================================================================
// API: /api/shifts
//   GET  — list staff shifts (filter by facility, date range, staff, shift type)
//   POST — create a new staff shift
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const staffId = url.searchParams.get("staffId");
  const shiftType = url.searchParams.get("shiftType");
  const status = url.searchParams.get("status");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  // Scope facilities to user's org
  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { facilityId: { in: orgFacilityIds } };
  if (facilityId) where.facilityId = facilityId;
  if (staffId) where.staffId = staffId;
  if (shiftType) where.shiftType = shiftType;
  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.shiftDate = {};
    if (dateFrom) where.shiftDate.gte = new Date(dateFrom);
    if (dateTo) where.shiftDate.lte = new Date(dateTo);
  }

  const shifts = await db.staffShift.findMany({
    where,
    orderBy: [{ shiftDate: "desc" }, { startTime: "desc" }],
    take: 200,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  });

  const items = shifts.map((s) => ({
    id: s.id,
    staffId: s.staffId,
    staff: s.staff,
    facilityId: s.facilityId,
    facility: s.facility,
    department: s.department,
    shiftDate: s.shiftDate,
    startTime: s.startTime,
    endTime: s.endTime,
    shiftType: s.shiftType,
    status: s.status,
  }));

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { staffId, facilityId, departmentId, shiftDate, startTime, endTime, shiftType } = body;

  if (!staffId || !facilityId || !shiftDate || !startTime) {
    return NextResponse.json({ error: "staffId, facilityId, shiftDate, startTime are required" }, { status: 400 });
  }

  // Validate facility + staff belong to org
  const facility = await db.facility.findUnique({ where: { id: facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  }
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    include: { user: { select: { organizationId: true } } },
  });
  if (!staff || staff.user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid staff member" }, { status: 400 });
  }

  const shift = await db.staffShift.create({
    data: {
      staffId,
      facilityId,
      departmentId: departmentId || null,
      shiftDate: new Date(shiftDate),
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : null,
      shiftType: shiftType || "morning",
      status: "scheduled",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "SHIFT_CREATED",
    resourceType: "staff_shift",
    resourceId: shift.id,
    newValues: { staffId, facilityId, shiftDate, shiftType },
  });

  return NextResponse.json({ item: shift }, { status: 201 });
}
