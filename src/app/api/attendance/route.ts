// =====================================================================
// API: /api/attendance
//   GET  — list attendance records (filter by facility, date, staff)
//   POST — check-in or check-out a staff member for today
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Helper: get today's date at midnight (local) as a Date
function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const staffId = url.searchParams.get("staffId");
  const date = url.searchParams.get("date"); // YYYY-MM-DD
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const status = url.searchParams.get("status");

  // Scope facilities to user's org
  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { facilityId: { in: orgFacilityIds } };
  if (facilityId) where.facilityId = facilityId;
  if (staffId) where.staffId = staffId;
  if (status) where.status = status;
  if (date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    where.date = d;
  } else if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) {
      const d = new Date(dateFrom);
      d.setHours(0, 0, 0, 0);
      where.date.gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      where.date.lte = d;
    }
  }

  const records = await db.staffAttendance.findMany({
    where,
    orderBy: [{ date: "desc" }, { checkInAt: "desc" }],
    take: 500,
    include: {
      staff: {
        select: {
          id: true,
          staffNumber: true,
          firstName: true,
          lastName: true,
          professionalRole: true,
          phone: true,
        },
      },
      facility: { select: { id: true, name: true, code: true } },
    },
  });

  const items = records.map((r) => ({
    id: r.id,
    staffId: r.staffId,
    staff: r.staff,
    facilityId: r.facilityId,
    facility: r.facility,
    date: r.date,
    checkInAt: r.checkInAt,
    checkOutAt: r.checkOutAt,
    status: r.status,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { staffId, facilityId, action, notes, date, status } = body;
  // action: "check_in" | "check_out"

  if (!staffId || !facilityId || !action) {
    return NextResponse.json(
      { error: "staffId, facilityId, action are required" },
      { status: 400 }
    );
  }

  if (action !== "check_in" && action !== "check_out") {
    return NextResponse.json(
      { error: "action must be 'check_in' or 'check_out'" },
      { status: 400 }
    );
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

  // Determine the attendance date (default: today)
  const attendanceDate = date ? new Date(date) : todayDate();
  attendanceDate.setHours(0, 0, 0, 0);

  const now = new Date();

  // Try to find existing record for this staff + date
  const existing = await db.staffAttendance.findUnique({
    where: {
      staffId_date: { staffId, date: attendanceDate },
    },
  });

  let record;
  if (action === "check_in") {
    if (existing?.checkInAt) {
      return NextResponse.json(
        { error: "Staff already checked in today" },
        { status: 409 }
      );
    }
    // Determine status: late if check-in is after 09:00 local
    const lateThreshold = new Date(attendanceDate);
    lateThreshold.setHours(9, 0, 0, 0);
    const computedStatus = status || (now > lateThreshold ? "late" : "present");

    if (existing) {
      // Update existing record (e.g., was marked absent, now checking in)
      record = await db.staffAttendance.update({
        where: { id: existing.id },
        data: {
          checkInAt: now,
          status: computedStatus,
          notes: notes || existing.notes,
        },
      });
    } else {
      record = await db.staffAttendance.create({
        data: {
          staffId,
          facilityId,
          date: attendanceDate,
          checkInAt: now,
          checkOutAt: null,
          status: computedStatus,
          notes: notes || null,
        },
      });
    }
  } else {
    // check_out
    if (!existing) {
      return NextResponse.json(
        { error: "No check-in record found for today. Check in first." },
        { status: 400 }
      );
    }
    if (existing.checkOutAt) {
      return NextResponse.json(
        { error: "Staff already checked out today" },
        { status: 409 }
      );
    }
    record = await db.staffAttendance.update({
      where: { id: existing.id },
      data: {
        checkOutAt: now,
        notes: notes || existing.notes,
      },
    });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: action === "check_in" ? "ATTENDANCE_CHECK_IN" : "ATTENDANCE_CHECK_OUT",
    resourceType: "staff_attendance",
    resourceId: record.id,
    newValues: { staffId, facilityId, date: attendanceDate, action, status: record.status },
  });

  return NextResponse.json({ item: record }, { status: 201 });
}
