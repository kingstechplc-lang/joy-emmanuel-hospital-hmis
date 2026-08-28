// =====================================================================
// API: /api/attendance
//   GET  — list attendance records (filter by facility, date, staff, status, source)
//   POST — check-in OR check-out (legacy single endpoint, kept for backward compat)
//          Prefer /api/attendance/check-in and /api/attendance/check-out
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  calculateLate,
  calculateEarlyDeparture,
  calculateWorkedDuration,
  calculateOvertime,
  isOvernightShift,
  is24HourShift,
  isNightDuty,
  deriveAttendanceStatus,
  isMissingCheckOut,
  detectAbsence,
  DEFAULT_ATTENDANCE_POLICY,
} from "@/lib/attendance-engine";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const staffId = url.searchParams.get("staffId");
  const date = url.searchParams.get("date");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const status = url.searchParams.get("status");
  const source = url.searchParams.get("source");
  const departmentId = url.searchParams.get("departmentId");

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { facilityId: { in: orgFacilityIds } };
  if (facilityId) where.facilityId = facilityId;
  if (staffId) where.staffId = staffId;
  if (status) where.status = status;
  if (source) where.source = source;
  if (departmentId) where.departmentId = departmentId;
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
          id: true, staffNumber: true, firstName: true, lastName: true,
          professionalRole: true, profession: true, phone: true, employmentStatus: true,
        },
      },
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      shift: { select: { id: true, shiftDate: true, startTime: true, endTime: true, shiftType: true, isOvernight: true } },
      _count: { select: { corrections: true, exceptions: true } },
    },
  });

  const items = records.map((r) => ({
    id: r.id,
    staffId: r.staffId,
    staff: r.staff,
    facilityId: r.facilityId,
    facility: r.facility,
    department: r.department,
    date: r.date,
    shiftId: r.shiftId,
    shift: r.shift,
    checkInAt: r.checkInAt,
    checkOutAt: r.checkOutAt,
    status: r.status,
    source: r.source,
    lateMinutes: r.lateMinutes,
    earlyDepartureMinutes: r.earlyDepartureMinutes,
    workedMinutes: r.workedMinutes,
    grossMinutes: r.grossMinutes,
    breakMinutes: r.breakMinutes,
    overtimeMinutes: r.overtimeMinutes,
    isOvernight: r.isOvernight,
    is24Hour: r.is24Hour,
    isUnscheduled: r.isUnscheduled,
    isEmergencyDuty: r.isEmergencyDuty,
    isManualEntry: r.isManualEntry,
    isLocked: r.isLocked,
    notes: r.notes,
    correctionCount: r._count.corrections,
    exceptionCount: r._count.exceptions,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return NextResponse.json({ items, count: items.length });
}

// ---------------------------------------------------------------------
// POST — legacy check-in/check-out endpoint (backward compatible)
// Delegates to the same logic as /check-in and /check-out routes.
// ---------------------------------------------------------------------
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE) && !hasPermission(session, PERMISSIONS.ATTENDANCE_RECORD)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { staffId, facilityId, action, notes, date, source } = body;

  if (!staffId || !facilityId || !action) {
    return NextResponse.json({ error: "staffId, facilityId, action are required" }, { status: 400 });
  }

  if (action !== "check_in" && action !== "check_out") {
    return NextResponse.json({ error: "action must be 'check_in' or 'check_out'" }, { status: 400 });
  }

  // Validate facility + staff
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
  if (staff.employmentStatus !== "active" && staff.employmentStatus !== "on_leave") {
    return NextResponse.json({ error: `Staff is not active (status: ${staff.employmentStatus}).` }, { status: 400 });
  }

  const attendanceDate = date ? new Date(date) : todayDate();
  attendanceDate.setHours(0, 0, 0, 0);
  const now = new Date();

  // Find the scheduled shift for this staff on this date
  const scheduledShift = await db.staffShift.findFirst({
    where: {
      staffId,
      shiftDate: {
        gte: new Date(attendanceDate.getTime() - 24 * 60 * 60 * 1000),
        lte: new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000),
      },
      status: { in: ["scheduled", "checked_in", "on_break"] },
    },
    orderBy: { startTime: "asc" },
  });

  // Check if staff is on approved leave
  const approvedLeave = await db.leaveRecord.findFirst({
    where: {
      staffId,
      status: "approved",
      startDate: { lte: attendanceDate },
      OR: [{ endDate: null }, { endDate: { gte: attendanceDate } }],
    },
  });

  // Try to find existing attendance record
  const existing = await db.staffAttendance.findUnique({
    where: { staffId_date: { staffId, date: attendanceDate } },
  });

  // Prevent modification if locked
  if (existing?.isLocked) {
    return NextResponse.json({ error: "This attendance record is locked by a closed period." }, { status: 403 });
  }

  let record;
  if (action === "check_in") {
    if (existing?.checkInAt) {
      return NextResponse.json({ error: "Staff already checked in today" }, { status: 409 });
    }

    // Check for approved leave conflict
    if (approvedLeave) {
      return NextResponse.json({
        error: `Staff is on approved ${approvedLeave.leaveType || ""} leave. Cannot check in.`,
      }, { status: 400 });
    }

    // Calculate late arrival
    const expectedStart = scheduledShift?.startTime || null;
    const lateResult = calculateLate(expectedStart, now, DEFAULT_ATTENDANCE_POLICY.gracePeriodMinutes, DEFAULT_ATTENDANCE_POLICY.lateThresholdMinutes);

    // Determine status
    const isUnscheduled = !scheduledShift;
    const computedStatus = isUnscheduled ? "unscheduled" : (lateResult.isLate ? "late" : "checked_in");

    const isOvernight = scheduledShift ? isOvernightShift(scheduledShift.startTime, scheduledShift.endTime) : false;
    const is24h = scheduledShift ? is24HourShift(scheduledShift.startTime, scheduledShift.endTime) : false;

    if (existing) {
      record = await db.staffAttendance.update({
        where: { id: existing.id },
        data: {
          checkInAt: now,
          rawCheckInAt: now,
          status: computedStatus,
          source: source || "web",
          shiftId: scheduledShift?.id || existing.shiftId,
          expectedStart: expectedStart,
          expectedEnd: scheduledShift?.endTime || null,
          lateMinutes: lateResult.lateMinutes,
          isOvernight,
          is24Hour: is24h,
          isUnscheduled,
          notes: notes || existing.notes,
        },
      });
    } else {
      record = await db.staffAttendance.create({
        data: {
          staffId,
          facilityId,
          departmentId: scheduledShift?.departmentId || staff.departmentId || null,
          date: attendanceDate,
          shiftId: scheduledShift?.id || null,
          checkInAt: now,
          rawCheckInAt: now,
          status: computedStatus,
          source: source || "web",
          expectedStart: expectedStart,
          expectedEnd: scheduledShift?.endTime || null,
          lateMinutes: lateResult.lateMinutes,
          isOvernight,
          is24Hour: is24h,
          isUnscheduled,
          notes: notes || null,
        },
      });
    }

    // Update shift status
    if (scheduledShift) {
      await db.staffShift.update({
        where: { id: scheduledShift.id },
        data: { status: lateResult.isLate ? "late" : "checked_in" },
      });
    }

    // Create exception for late arrival
    if (lateResult.isLate) {
      await db.attendanceException.create({
        data: {
          organizationId: session.user.organizationId,
          attendanceId: record.id,
          staffId,
          facilityId,
          departmentId: scheduledShift?.departmentId || staff.departmentId || null,
          date: attendanceDate,
          exceptionType: "late",
          severity: "warning",
          description: `Late arrival by ${lateResult.lateMinutes} minutes.`,
          metadata: JSON.stringify({ lateMinutes: lateResult.lateMinutes, scheduledStart: expectedStart, actualCheckIn: now }),
          status: "open",
        },
      }).catch(() => {});
    }

    // Create exception for unscheduled attendance
    if (isUnscheduled) {
      await db.attendanceException.create({
        data: {
          organizationId: session.user.organizationId,
          attendanceId: record.id,
          staffId,
          facilityId,
          departmentId: staff.departmentId || null,
          date: attendanceDate,
          exceptionType: "unscheduled",
          severity: "info",
          description: "Checked in without a scheduled shift.",
          metadata: JSON.stringify({ checkInAt: now }),
          status: "open",
        },
      }).catch(() => {});
    }

    // Log raw event
    await db.attendanceEvent.create({
      data: {
        organizationId: session.user.organizationId,
        staffId,
        facilityId,
        departmentId: scheduledShift?.departmentId || staff.departmentId || null,
        attendanceId: record.id,
        timestamp: now,
        eventType: "check_in",
        source: source || "web",
        processingStatus: "processed",
      },
    }).catch(() => {});

  } else {
    // check_out
    if (!existing) {
      return NextResponse.json({ error: "No check-in record found for today. Check in first." }, { status: 400 });
    }
    if (existing.checkOutAt) {
      return NextResponse.json({ error: "Staff already checked out today" }, { status: 409 });
    }

    // Calculate worked duration
    const worked = calculateWorkedDuration(existing.checkInAt, now, existing.breakMinutes || DEFAULT_ATTENDANCE_POLICY.breakDurationMinutes);

    // Calculate early departure
    const expectedEnd = existing.expectedEnd || scheduledShift?.endTime || null;
    const earlyResult = calculateEarlyDeparture(expectedEnd, now, DEFAULT_ATTENDANCE_POLICY.earlyDepartureThresholdMinutes);

    // Calculate overtime
    const isNight = isNightDuty(existing.checkInAt, DEFAULT_ATTENDANCE_POLICY.nightStartHour, DEFAULT_ATTENDANCE_POLICY.nightEndHour);
    const scheduledMinutes = scheduledShift && scheduledShift.startTime && scheduledShift.endTime
      ? Math.round((scheduledShift.endTime.getTime() - scheduledShift.startTime.getTime()) / (1000 * 60))
      : null;
    const overtimeResult = calculateOvertime(worked.netMinutes, scheduledMinutes, DEFAULT_ATTENDANCE_POLICY.overtimeThresholdMinutes, {
      isNight,
      isOnCall: scheduledShift?.isOnCall || false,
    });

    // Derive final status
    const computedStatus = deriveAttendanceStatus({
      hasShift: !!scheduledShift,
      checkInAt: existing.checkInAt,
      checkOutAt: now,
      isLate: existing.lateMinutes > 0,
      isEarlyDeparture: earlyResult.isEarly,
      isAbsent: false,
      isOnApprovedLeave: !!approvedLeave,
      isOffDuty: false,
      isHoliday: false,
      isUnscheduled: existing.isUnscheduled,
      isEmergencyDuty: existing.isEmergencyDuty,
      isOnCall: scheduledShift?.isOnCall || false,
      hasOvertime: overtimeResult.hasOvertime,
      isMissingCheckout: false,
      hasPendingCorrection: false,
    });

    record = await db.staffAttendance.update({
      where: { id: existing.id },
      data: {
        checkOutAt: now,
        rawCheckOutAt: now,
        status: computedStatus,
        grossMinutes: worked.grossMinutes,
        workedMinutes: worked.netMinutes,
        breakMinutes: existing.breakMinutes || DEFAULT_ATTENDANCE_POLICY.breakDurationMinutes,
        earlyDepartureMinutes: earlyResult.earlyMinutes,
        overtimeMinutes: overtimeResult.overtimeMinutes,
        notes: notes || existing.notes,
      },
    });

    // Update shift status
    if (scheduledShift) {
      await db.staffShift.update({
        where: { id: scheduledShift.id },
        data: {
          status: "checked_out",
          overtimeMinutes: overtimeResult.overtimeMinutes,
          attendanceReconciled: true,
        },
      });
    }

    // Create overtime record if overtime was worked
    if (overtimeResult.hasOvertime && overtimeResult.overtimeMinutes > 0) {
      await db.overtimeRecord.create({
        data: {
          organizationId: session.user.organizationId,
          staffId,
          facilityId,
          departmentId: scheduledShift?.departmentId || staff.departmentId || null,
          attendanceId: record.id,
          date: attendanceDate,
          overtimeMinutes: overtimeResult.overtimeMinutes,
          category: overtimeResult.category,
          reason: `Auto-generated from attendance check-out. Worked ${worked.netMinutes} min vs scheduled ${scheduledMinutes || DEFAULT_ATTENDANCE_POLICY.overtimeThresholdMinutes} min.`,
          status: "pending",
        },
      }).catch(() => {});
    }

    // Create exception for early departure
    if (earlyResult.isEarly) {
      await db.attendanceException.create({
        data: {
          organizationId: session.user.organizationId,
          attendanceId: record.id,
          staffId,
          facilityId,
          departmentId: scheduledShift?.departmentId || staff.departmentId || null,
          date: attendanceDate,
          exceptionType: "early_departure",
          severity: "warning",
          description: `Early departure by ${earlyResult.earlyMinutes} minutes.`,
          metadata: JSON.stringify({ earlyMinutes: earlyResult.earlyMinutes, scheduledEnd: expectedEnd, actualCheckOut: now }),
          status: "open",
        },
      }).catch(() => {});
    }

    // Log raw event
    await db.attendanceEvent.create({
      data: {
        organizationId: session.user.organizationId,
        staffId,
        facilityId,
        departmentId: scheduledShift?.departmentId || staff.departmentId || null,
        attendanceId: record.id,
        timestamp: now,
        eventType: "check_out",
        source: source || "web",
        processingStatus: "processed",
      },
    }).catch(() => {});
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
