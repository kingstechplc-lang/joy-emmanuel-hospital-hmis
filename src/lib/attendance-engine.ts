// =====================================================================
// ATTENDANCE ENGINE — Core attendance calculation utilities
// =====================================================================
// Implements:
//   - Late arrival calculation with configurable grace period
//   - Early departure calculation
//   - Worked duration (gross, break, net)
//   - Overtime calculation
//   - Overnight shift / 24-hour shift handling
//   - Missing check-out detection
//   - Absence detection (considering leave, off-duty, holidays)
//   - Attendance status derivation
//   - Time rounding (configurable)
//   - Night / weekend / holiday duty detection
//
// All functions are PURE — they take inputs and return results.
// They never touch the database.
// =====================================================================

// ---------------------------------------------------------------------
// TIME CALCULATIONS
// ---------------------------------------------------------------------

/**
 * Calculate minutes between two timestamps.
 * Returns 0 if either is null or end <= start.
 */
export function minutesBetween(start: Date | null, end: Date | null): number {
  if (!start || !end) return 0;
  const ms = end.getTime() - start.getTime();
  return ms > 0 ? Math.floor(ms / (1000 * 60)) : 0;
}

/**
 * Calculate hours between two timestamps (decimal).
 */
export function hoursBetween(start: Date | null, end: Date | null): number {
  return minutesBetween(start, end) / 60;
}

/**
 * Format minutes as "Xh Ym" or "Xh" or "Ym".
 */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Format hours (decimal) as "Xh Ym".
 */
export function formatHours(hours: number): string {
  return formatMinutes(Math.round(hours * 60));
}

// ---------------------------------------------------------------------
// TIME ROUNDING
// ---------------------------------------------------------------------

/**
 * Round a timestamp to the nearest N minutes.
 * Preserves the original timestamp separately for audit.
 */
export function roundTimestamp(date: Date, roundingMinutes: number, mode: "nearest" | "up" | "down" = "nearest"): Date {
  if (roundingMinutes <= 0) return date;
  const ms = date.getTime();
  const roundingMs = roundingMinutes * 60 * 1000;
  switch (mode) {
    case "up":
      return new Date(Math.ceil(ms / roundingMs) * roundingMs);
    case "down":
      return new Date(Math.floor(ms / roundingMs) * roundingMs);
    case "nearest":
    default:
      return new Date(Math.round(ms / roundingMs) * roundingMs);
  }
}

// ---------------------------------------------------------------------
// LATE ARRIVAL CALCULATION
// ---------------------------------------------------------------------

export type LateResult = {
  isLate: boolean;
  lateMinutes: number;
};

/**
 * Calculate late arrival based on scheduled start, actual check-in, and grace period.
 *
 * Example:
 *   scheduledStart = 08:00
 *   actualCheckIn = 08:17
 *   gracePeriod = 10 minutes
 *   → late by 7 minutes (17 - 10 = 7)
 *
 * If check-in is before scheduled start, not late.
 * If check-in is within grace period, not late.
 */
export function calculateLate(
  scheduledStart: Date | null,
  actualCheckIn: Date | null,
  gracePeriodMinutes: number = 10,
  lateThresholdMinutes: number = 0
): LateResult {
  if (!scheduledStart || !actualCheckIn) return { isLate: false, lateMinutes: 0 };

  const diffMs = actualCheckIn.getTime() - scheduledStart.getTime();
  if (diffMs <= 0) return { isLate: false, lateMinutes: 0 };

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const effectiveLate = diffMinutes - gracePeriodMinutes;

  if (effectiveLate <= lateThresholdMinutes) {
    return { isLate: false, lateMinutes: 0 };
  }

  return { isLate: true, lateMinutes: effectiveLate };
}

// ---------------------------------------------------------------------
// EARLY DEPARTURE CALCULATION
// ---------------------------------------------------------------------

export type EarlyDepartureResult = {
  isEarly: boolean;
  earlyMinutes: number;
};

/**
 * Calculate early departure based on scheduled end and actual check-out.
 *
 * Example:
 *   scheduledEnd = 16:00
 *   actualCheckOut = 15:30
 *   threshold = 15 minutes
 *   → early by 30 minutes
 */
export function calculateEarlyDeparture(
  scheduledEnd: Date | null,
  actualCheckOut: Date | null,
  thresholdMinutes: number = 15
): EarlyDepartureResult {
  if (!scheduledEnd || !actualCheckOut) return { isEarly: false, earlyMinutes: 0 };

  const diffMs = scheduledEnd.getTime() - actualCheckOut.getTime();
  if (diffMs <= 0) return { isEarly: false, earlyMinutes: 0 };

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < thresholdMinutes) {
    return { isEarly: false, earlyMinutes: 0 };
  }

  return { isEarly: true, earlyMinutes: diffMinutes };
}

// ---------------------------------------------------------------------
// WORKED DURATION CALCULATION
// ---------------------------------------------------------------------

export type WorkedDuration = {
  grossMinutes: number;
  breakMinutes: number;
  netMinutes: number;
  netHours: number;
};

/**
 * Calculate worked duration from check-in and check-out.
 * Handles overnight shifts correctly (check-out on next day).
 *
 * gross = checkOut - checkIn
 * net = gross - breaks
 */
export function calculateWorkedDuration(
  checkIn: Date | null,
  checkOut: Date | null,
  breakMinutes: number = 0
): WorkedDuration {
  const gross = minutesBetween(checkIn, checkOut);
  const net = Math.max(0, gross - breakMinutes);
  return {
    grossMinutes: gross,
    breakMinutes,
    netMinutes: net,
    netHours: net / 60,
  };
}

// ---------------------------------------------------------------------
// OVERTIME CALCULATION
// ---------------------------------------------------------------------

export type OvertimeResult = {
  overtimeMinutes: number;
  hasOvertime: boolean;
  category: string; // regular | night | weekend | holiday | emergency | on_call
};

/**
 * Calculate overtime based on worked duration vs scheduled/expected hours.
 *
 * Overtime = max(0, actualWorked - overtimeThreshold)
 *
 * Does NOT automatically convert every extra minute into payable overtime.
 * The threshold is configurable (default 8h = 480 min).
 */
export function calculateOvertime(
  actualWorkedMinutes: number,
  scheduledMinutes: number | null,
  overtimeThresholdMinutes: number = 480,
  options: {
    isNight?: boolean;
    isWeekend?: boolean;
    isHoliday?: boolean;
    isEmergency?: boolean;
    isOnCall?: boolean;
  } = {}
): OvertimeResult {
  // Overtime is only counted if actual worked exceeds scheduled OR threshold
  const baseline = scheduledMinutes || overtimeThresholdMinutes;
  const overtime = Math.max(0, actualWorkedMinutes - baseline);

  let category = "regular";
  if (options.isHoliday) category = "holiday";
  else if (options.isEmergency) category = "emergency";
  else if (options.isOnCall) category = "on_call";
  else if (options.isNight) category = "night";
  else if (options.isWeekend) category = "weekend";

  return {
    overtimeMinutes: overtime,
    hasOvertime: overtime > 0,
    category,
  };
}

// ---------------------------------------------------------------------
// OVERNIGHT / 24-HOUR SHIFT HANDLING
// ---------------------------------------------------------------------

/**
 * Determine if a check-out on a different day is valid for an overnight shift.
 *
 * For overnight shifts, the check-out may be on the next calendar day.
 * We consider it valid if check-out is within 16 hours of check-in
 * (allows up to 16h shifts including overnight).
 */
export function isOvernightCheckOutValid(
  shiftStart: Date,
  shiftEnd: Date | null,
  checkOut: Date
): boolean {
  if (!shiftEnd) return false;
  const shiftDurationMs = shiftEnd.getTime() - shiftStart.getTime();
  const checkoutDiffMs = checkOut.getTime() - shiftStart.getTime();
  // Check-out should be within a reasonable window of the shift end
  // Allow 2 hours grace before and after the scheduled end
  const graceMs = 2 * 60 * 60 * 1000;
  return (
    checkoutDiffMs >= shiftDurationMs - graceMs &&
    checkoutDiffMs <= shiftDurationMs + graceMs
  );
}

/**
 * Returns true if a shift spans midnight (ends on a different calendar day).
 */
export function isOvernightShift(start: Date, end: Date | null): boolean {
  if (!end) return false;
  return start.toDateString() !== end.toDateString();
}

/**
 * Returns true if a shift is approximately 24 hours.
 */
export function is24HourShift(start: Date, end: Date | null): boolean {
  if (!end) return false;
  const hours = hoursBetween(start, end);
  return Math.abs(hours - 24) < 0.5; // within 30 minutes
}

// ---------------------------------------------------------------------
// MISSING CHECK-OUT DETECTION
// ---------------------------------------------------------------------

/**
 * Determine if an attendance record is missing a check-out.
 * A record is "missing checkout" if:
 *   - checkInAt is set
 *   - checkOutAt is null
 *   - The scheduled shift end has passed (or current time is well past check-in)
 */
export function isMissingCheckOut(
  checkInAt: Date | null,
  checkOutAt: Date | null,
  scheduledEnd: Date | null,
  currentTime: Date = new Date()
): boolean {
  if (!checkInAt || checkOutAt) return false;

  // If we have a scheduled end, check if it has passed
  if (scheduledEnd) {
    return currentTime.getTime() > scheduledEnd.getTime();
  }

  // Otherwise, check if more than 12 hours have passed since check-in
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  return currentTime.getTime() - checkInAt.getTime() > twelveHoursMs;
}

// ---------------------------------------------------------------------
// ABSENCE DETECTION
// ---------------------------------------------------------------------

export type AbsenceResult = {
  isAbsent: boolean;
  reason: string;
};

/**
 * Determine if a staff member should be marked absent.
 *
 * NOT absent if:
 *   - They have a valid check-in
 *   - They are on approved leave
 *   - They are off-duty (no shift scheduled)
 *   - It's a public holiday
 *   - The shift hasn't started yet (don't prematurely mark absent)
 *
 * This function does NOT automatically mark someone absent just because
 * they haven't checked in early in the shift. It uses timing rules.
 */
export function detectAbsence(
  hasShift: boolean,
  hasCheckIn: boolean,
  isOnApprovedLeave: boolean,
  isOffDuty: boolean,
  isHoliday: boolean,
  shiftStart: Date | null,
  currentTime: Date = new Date(),
  absenceProcessingDelayMinutes: number = 120
): AbsenceResult {
  // Not absent if checked in
  if (hasCheckIn) return { isAbsent: false, reason: "Checked in" };

  // Not absent if on approved leave
  if (isOnApprovedLeave) return { isAbsent: false, reason: "On approved leave" };

  // Not absent if no shift scheduled (off duty)
  if (!hasShift || isOffDuty) return { isAbsent: false, reason: "Off duty / no shift" };

  // Not absent if public holiday and not expected
  if (isHoliday) return { isAbsent: false, reason: "Public holiday" };

  // Not absent if shift hasn't started yet (or within grace window)
  if (shiftStart) {
    const timeSinceStart = currentTime.getTime() - shiftStart.getTime();
    const delayMs = absenceProcessingDelayMinutes * 60 * 1000;
    if (timeSinceStart < delayMs) {
      return { isAbsent: false, reason: "Within absence processing window" };
    }
  }

  return { isAbsent: true, reason: "No check-in recorded after shift start + grace period" };
}

// ---------------------------------------------------------------------
// ATTENDANCE STATUS DERIVATION
// ---------------------------------------------------------------------

export type AttendanceStatus =
  | "scheduled"
  | "present"
  | "checked_in"
  | "checked_out"
  | "late"
  | "early_departure"
  | "absent"
  | "on_leave"
  | "off_duty"
  | "on_call"
  | "half_day"
  | "overtime"
  | "missing_checkout"
  | "correction_pending"
  | "excused_absence"
  | "unscheduled"
  | "emergency_duty";

/**
 * Derive the attendance status from the actual data.
 * This is the canonical status determination logic.
 */
export function deriveAttendanceStatus(params: {
  hasShift: boolean;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  isLate: boolean;
  isEarlyDeparture: boolean;
  isAbsent: boolean;
  isOnApprovedLeave: boolean;
  isOffDuty: boolean;
  isHoliday: boolean;
  isUnscheduled: boolean;
  isEmergencyDuty: boolean;
  isOnCall: boolean;
  hasOvertime: boolean;
  isMissingCheckout: boolean;
  hasPendingCorrection: boolean;
}): AttendanceStatus {
  // Correction pending takes precedence (if there's a pending correction, show that status)
  if (params.hasPendingCorrection) return "correction_pending";

  // On approved leave
  if (params.isOnApprovedLeave) return "on_leave";

  // Off duty (no shift, not checked in)
  if (params.isOffDuty && !params.checkInAt) return "off_duty";

  // Emergency duty (unscheduled but authorized)
  if (params.isEmergencyDuty) return "emergency_duty";

  // Unscheduled attendance (checked in without a shift)
  if (params.isUnscheduled && params.checkInAt) return "unscheduled";

  // Absent
  if (params.isAbsent && !params.checkInAt) return "absent";

  // Missing check-out
  if (params.isMissingCheckout) return "missing_checkout";

  // Checked out — determine final status
  if (params.checkOutAt) {
    if (params.hasOvertime) return "overtime";
    if (params.isEarlyDeparture) return "early_departure";
    return "checked_out";
  }

  // Checked in but not out
  if (params.checkInAt) {
    if (params.isLate) return "late";
    return "checked_in";
  }

  // On-call (assigned but not worked)
  if (params.isOnCall) return "on_call";

  // Scheduled but not yet checked in
  if (params.hasShift) return "scheduled";

  return "off_duty";
}

// ---------------------------------------------------------------------
// NIGHT / WEEKEND / HOLIDAY DETECTION
// ---------------------------------------------------------------------

/**
 * Returns true if the check-in time falls within night duty hours.
 * Default night window: 19:00–07:00.
 */
export function isNightDuty(
  checkIn: Date | null,
  nightStartHour: number = 19,
  nightEndHour: number = 7
): boolean {
  if (!checkIn) return false;
  const hour = checkIn.getHours();
  return hour >= nightStartHour || hour < nightEndHour;
}

/**
 * Returns true if the date is a weekend (Saturday or Sunday).
 */
export function isWeekend(date: Date, weekendStartDay: number = 6): boolean {
  const day = date.getDay(); // 0=Sun, 6=Sat
  // weekendStartDay=6 (Saturday) → weekend is Sat(6) and Sun(0)
  if (weekendStartDay === 6) return day === 0 || day === 6;
  return day === weekendStartDay || day === 0;
}

/**
 * Returns true if the date is a public holiday.
 */
export function isHolidayDate(date: Date, holidays: Date[]): boolean {
  const dateStr = date.toDateString();
  return holidays.some((h) => h.toDateString() === dateStr);
}

// ---------------------------------------------------------------------
// ATTENDANCE EXCEPTION TYPES
// ---------------------------------------------------------------------

export const EXCEPTION_TYPES = [
  { value: "late", label: "Late Arrival", severity: "warning" },
  { value: "early_departure", label: "Early Departure", severity: "warning" },
  { value: "missing_checkout", label: "Missing Check-Out", severity: "warning" },
  { value: "absent", label: "Absent", severity: "error" },
  { value: "unscheduled", label: "Unscheduled Attendance", severity: "info" },
  { value: "attendance_during_leave", label: "Attendance During Leave", severity: "error" },
  { value: "duplicate_checkin", label: "Duplicate Check-In", severity: "error" },
  { value: "duplicate_checkout", label: "Duplicate Check-Out", severity: "error" },
  { value: "excessive_hours", label: "Excessive Hours", severity: "warning" },
  { value: "invalid_facility", label: "Invalid Facility", severity: "error" },
  { value: "schedule_mismatch", label: "Schedule Mismatch", severity: "warning" },
  { value: "overtime_exceeded", label: "Overtime Exceeded", severity: "info" },
] as const;

export const ATTENDANCE_SOURCES = [
  { value: "manual", label: "Manual" },
  { value: "web", label: "Web" },
  { value: "mobile", label: "Mobile" },
  { value: "biometric", label: "Biometric" },
  { value: "rfid", label: "RFID" },
  { value: "qr", label: "QR Code" },
  { value: "kiosk", label: "Kiosk" },
  { value: "api", label: "API / Device" },
] as const;

export const OVERTIME_CATEGORIES = [
  { value: "regular", label: "Regular Overtime" },
  { value: "night", label: "Night Overtime" },
  { value: "weekend", label: "Weekend Overtime" },
  { value: "holiday", label: "Public Holiday Overtime" },
  { value: "emergency", label: "Emergency Duty Overtime" },
  { value: "on_call", label: "On-Call Worked Overtime" },
] as const;

export const ATTENDANCE_STATUS_LIST = [
  { value: "scheduled", label: "Scheduled", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "present", label: "Present", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "checked_in", label: "Checked In", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { value: "checked_out", label: "Checked Out", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "late", label: "Late", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "early_departure", label: "Early Departure", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "absent", label: "Absent", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "on_leave", label: "On Leave", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "off_duty", label: "Off Duty", color: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: "on_call", label: "On Call", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { value: "half_day", label: "Half Day", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "overtime", label: "Overtime", color: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200" },
  { value: "missing_checkout", label: "Missing Check-Out", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "correction_pending", label: "Correction Pending", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "excused_absence", label: "Excused Absence", color: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: "unscheduled", label: "Unscheduled", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "emergency_duty", label: "Emergency Duty", color: "bg-red-100 text-red-700 border-red-200" },
] as const;

// ---------------------------------------------------------------------
// SCHEDULE VS ACTUAL COMPARISON
// ---------------------------------------------------------------------

export type ScheduleComparison = {
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  actualCheckIn: Date | null;
  actualCheckOut: Date | null;
  scheduledDurationMinutes: number;
  actualGrossMinutes: number;
  actualNetMinutes: number;
  startDifferenceMinutes: number; // + = late, - = early
  endDifferenceMinutes: number; // + = stayed late, - = left early
  durationDifferenceMinutes: number; // + = worked more, - = worked less
};

/**
 * Compare scheduled vs actual attendance.
 */
export function compareScheduleVsActual(
  scheduledStart: Date | null,
  scheduledEnd: Date | null,
  actualCheckIn: Date | null,
  actualCheckOut: Date | null,
  breakMinutes: number = 0
): ScheduleComparison {
  const scheduledDuration = minutesBetween(scheduledStart, scheduledEnd);
  const actualGross = minutesBetween(actualCheckIn, actualCheckOut);
  const actualNet = Math.max(0, actualGross - breakMinutes);

  const startDiff = scheduledStart && actualCheckIn
    ? Math.round((actualCheckIn.getTime() - scheduledStart.getTime()) / (1000 * 60))
    : 0;
  const endDiff = scheduledEnd && actualCheckOut
    ? Math.round((actualCheckOut.getTime() - scheduledEnd.getTime()) / (1000 * 60))
    : 0;
  const durationDiff = actualNet - scheduledDuration;

  return {
    scheduledStart,
    scheduledEnd,
    actualCheckIn,
    actualCheckOut,
    scheduledDurationMinutes: scheduledDuration,
    actualGrossMinutes: actualGross,
    actualNetMinutes: actualNet,
    startDifferenceMinutes: startDiff,
    endDifferenceMinutes: endDiff,
    durationDifferenceMinutes: durationDiff,
  };
}

// ---------------------------------------------------------------------
// ATTENDANCE RATE CALCULATION
// ---------------------------------------------------------------------

export type AttendanceRate = {
  scheduledDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  attendanceRate: number; // percentage
};

/**
 * Calculate attendance rate.
 * attendanceRate = presentDays / (scheduledDays - leaveDays) * 100
 * Approved leave is excluded from the denominator (not counted as unexplained absence).
 */
export function calculateAttendanceRate(
  scheduledDays: number,
  presentDays: number,
  leaveDays: number
): AttendanceRate {
  const expectedDays = Math.max(0, scheduledDays - leaveDays);
  const attendanceRate = expectedDays > 0 ? (presentDays / expectedDays) * 100 : 0;
  return {
    scheduledDays,
    presentDays,
    absentDays: Math.max(0, expectedDays - presentDays),
    leaveDays,
    attendanceRate: Math.round(attendanceRate * 10) / 10,
  };
}

// ---------------------------------------------------------------------
// ANOMALY DETECTION (FLAGS FOR REVIEW — NOT ACCUSATIONS)
// ---------------------------------------------------------------------

export type AnomalyFlag = {
  type: string;
  severity: "info" | "warning" | "error";
  description: string;
};

/**
 * Detect attendance anomalies for review.
 * These are FLAGS for authorized review, not automatic accusations of misconduct.
 */
export function detectAnomalies(params: {
  workedMinutes: number;
  maxDailyHours: number;
  hasMissingCheckout: boolean;
  isUnscheduled: boolean;
  isOnLeave: boolean;
  hasCheckIn: boolean;
  recentMissingCheckouts: number;
  recentManualCorrections: number;
}): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];

  // Excessive hours
  if (params.workedMinutes > params.maxDailyHours * 60) {
    flags.push({
      type: "excessive_hours",
      severity: "warning",
      description: `Worked ${formatMinutes(params.workedMinutes)} exceeds maximum daily hours of ${params.maxDailyHours}h.`,
    });
  }

  // Missing check-out
  if (params.hasMissingCheckout) {
    flags.push({
      type: "missing_checkout",
      severity: "warning",
      description: "Checked in but did not check out.",
    });
  }

  // Unscheduled attendance
  if (params.isUnscheduled && params.hasCheckIn) {
    flags.push({
      type: "unscheduled",
      severity: "info",
      description: "Checked in without a scheduled shift. May be legitimate emergency duty.",
    });
  }

  // Attendance during leave
  if (params.isOnLeave && params.hasCheckIn) {
    flags.push({
      type: "attendance_during_leave",
      severity: "error",
      description: "Checked in while on approved leave. Requires review.",
    });
  }

  // Repeated missing check-outs
  if (params.recentMissingCheckouts >= 3) {
    flags.push({
      type: "repeated_missing_checkout",
      severity: "warning",
      description: `${params.recentMissingCheckouts} missing check-outs in recent records.`,
    });
  }

  // Repeated manual corrections
  if (params.recentManualCorrections >= 3) {
    flags.push({
      type: "repeated_corrections",
      severity: "warning",
      description: `${params.recentManualCorrections} manual corrections in recent records.`,
    });
  }

  return flags;
}

// ---------------------------------------------------------------------
// DEFAULT ATTENDANCE POLICY
// ---------------------------------------------------------------------

export const DEFAULT_ATTENDANCE_POLICY = {
  gracePeriodMinutes: 10,
  lateThresholdMinutes: 0,
  earlyDepartureThresholdMinutes: 15,
  maxDailyHours: 13,
  overtimeThresholdMinutes: 480, // 8 hours
  minRestHours: 11,
  breakDurationMinutes: 30,
  paidBreaks: true,
  roundingMinutes: 0,
  roundingMode: "nearest" as const,
  missingCheckoutAction: "flag" as const,
  autoCheckoutTime: null,
  absenceProcessingEnabled: true,
  absenceProcessingDelayMinutes: 120,
  nightStartHour: 19,
  nightEndHour: 7,
  weekendStartDay: 6,
};

export type AttendancePolicyConfig = typeof DEFAULT_ATTENDANCE_POLICY;
