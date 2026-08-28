// API: /api/attendance/manual-entry — POST
// Authorized HR/supervisors may manually create attendance records.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { calculateWorkedDuration, calculateLate, calculateEarlyDeparture, calculateOvertime, isOvernightShift } from "@/lib/attendance-engine";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.ATTENDANCE_EDIT) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { staffId, facilityId, departmentId, date, checkInAt, checkOutAt, shiftId, reason, notes, source } = body;
  if (!staffId || !facilityId || !date || !reason) return NextResponse.json({ error: "staffId, facilityId, date, reason are required" }, { status: 400 });

  const facility = await db.facility.findUnique({ where: { id: facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  const staff = await db.staff.findUnique({ where: { id: staffId }, include: { user: { select: { organizationId: true } } } });
  if (!staff || staff.user.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Invalid staff member" }, { status: 400 });

  const attendanceDate = new Date(date);
  attendanceDate.setHours(0, 0, 0, 0);

  const existing = await db.staffAttendance.findUnique({ where: { staffId_date: { staffId, date: attendanceDate } } });
  if (existing) return NextResponse.json({ error: "Attendance record already exists for this date. Use correction workflow instead." }, { status: 409 });

  const checkIn = checkInAt ? new Date(checkInAt) : null;
  const checkOut = checkOutAt ? new Date(checkOutAt) : null;
  const shift = shiftId ? await db.staffShift.findUnique({ where: { id: shiftId } }) : null;
  const expectedStart = shift?.startTime || null;
  const expectedEnd = shift?.endTime || null;

  const lateResult = calculateLate(expectedStart, checkIn, 10, 0);
  const earlyResult = calculateEarlyDeparture(expectedEnd, checkOut, 15);
  const worked = calculateWorkedDuration(checkIn, checkOut, 30);
  const overtimeResult = calculateOvertime(worked.netMinutes, expectedStart && expectedEnd ? Math.round((expectedEnd.getTime() - expectedStart.getTime()) / (1000 * 60)) : null, 480, { isOnCall: shift?.isOnCall });
  const overnight = shift ? isOvernightShift(shift.startTime, shift.endTime) : false;

  const status = checkOut ? (overtimeResult.hasOvertime ? "overtime" : earlyResult.isEarly ? "early_departure" : "checked_out") : checkIn ? (lateResult.isLate ? "late" : "checked_in") : "absent";

  const record = await db.staffAttendance.create({
    data: {
      staffId,
      facilityId,
      departmentId: departmentId || shift?.departmentId || staff.departmentId || null,
      date: attendanceDate,
      shiftId: shiftId || null,
      checkInAt: checkIn,
      checkOutAt: checkOut,
      rawCheckInAt: checkIn,
      rawCheckOutAt: checkOut,
      status,
      source: source || "manual",
      lateMinutes: lateResult.lateMinutes,
      earlyDepartureMinutes: earlyResult.earlyMinutes,
      grossMinutes: worked.grossMinutes,
      workedMinutes: worked.netMinutes,
      breakMinutes: 30,
      overtimeMinutes: overtimeResult.overtimeMinutes,
      expectedStart,
      expectedEnd,
      isOvernight: overnight,
      isManualEntry: true,
      manualEntryReason: reason,
      manualEntryById: session.user.id,
      notes,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "ATTENDANCE_MANUAL_ENTRY",
    resourceType: "staff_attendance",
    resourceId: record.id,
    newValues: { staffId, date: attendanceDate, checkInAt, checkOutAt, reason },
    reason,
  });

  return NextResponse.json({ item: record }, { status: 201 });
}
