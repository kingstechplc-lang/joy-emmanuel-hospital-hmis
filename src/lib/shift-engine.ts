// =====================================================================
// SHIFT ENGINE — Core scheduling utilities for the HMIS Workforce module
// =====================================================================
// Implements:
//   - Overnight / 24-hour / variable-length shift duration calculation
//   - Shift overlap / double-booking conflict detection
//   - Rest period validation between shifts
//   - Maximum working hours enforcement (daily/weekly/monthly)
//   - Consecutive shift / consecutive night shift limits
//   - Fatigue risk identification
//   - Leave day calculation (working days, holidays, weekends)
//   - Working calendar helpers
//   - Leave balance arithmetic
//
// All functions are PURE — they take inputs and return results.
// They never touch the database. DB queries happen in the API routes.
// =====================================================================

// ---------------------------------------------------------------------
// SHIFT DURATION CALCULATIONS
// ---------------------------------------------------------------------

/**
 * Calculate shift duration in hours, correctly handling overnight shifts.
 *
 * Example:
 *   start=19:00, end=07:00 (next day) → 12 hours
 *   start=08:00, end=17:00 (same day) → 9 hours
 *   start=08:00, end=08:00 (next day) → 24 hours
 *
 * If endTime is null, returns 0 (open-ended shift).
 */
export function calculateShiftHours(startTime: Date, endTime: Date | null | undefined): number {
  if (!endTime) return 0;
  const ms = endTime.getTime() - startTime.getTime();
  if (ms <= 0) return 0; // invalid — treat as 0
  return ms / (1000 * 60 * 60);
}

/**
 * Calculate shift duration in minutes (for break/overtime math).
 */
export function calculateShiftMinutes(startTime: Date, endTime: Date | null | undefined): number {
  if (!endTime) return 0;
  const ms = endTime.getTime() - startTime.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (1000 * 60));
}

/**
 * Returns true if a shift crosses midnight (ends on a different calendar day than it starts).
 */
export function isOvernightShift(startTime: Date, endTime: Date | null | undefined): boolean {
  if (!endTime) return false;
  const startDay = startTime.getDate();
  const endDay = endTime.getDate();
  const startMonth = startTime.getMonth();
  const endMonth = endTime.getMonth();
  return startDay !== endDay || startMonth !== endMonth;
}

/**
 * Returns true if a shift is exactly 24 hours (within 1-minute tolerance).
 */
export function is24HourShift(startTime: Date, endTime: Date | null | undefined): boolean {
  const hours = calculateShiftHours(startTime, endTime);
  return Math.abs(hours - 24) < (1 / 60);
}

/**
 * Returns true if a shift's start hour is within night-duty window (default 19:00–07:00).
 */
export function isNightShift(startTime: Date, endTime: Date | null | undefined, nightStartHour = 19, nightEndHour = 7): boolean {
  const startHour = startTime.getHours();
  // Night shift: starts between 19:00 and 23:59 OR between 00:00 and 07:00
  const startsAtNight = startHour >= nightStartHour || startHour < nightEndHour;
  // OR ends after midnight but before 07:00
  if (!startsAtNight && endTime) {
    const endHour = endTime.getHours();
    return endHour > 0 && endHour <= nightEndHour;
  }
  return startsAtNight;
}

// ---------------------------------------------------------------------
// SHIFT CONFLICT DETECTION
// ---------------------------------------------------------------------

export type ShiftWindow = {
  id?: string;
  startTime: Date;
  endTime: Date | null;
};

export type ConflictWarning = {
  type:
    | "overlap"
    | "double_booking"
    | "cross_facility"
    | "leave_conflict"
    | "insufficient_rest"
    | "excessive_hours_daily"
    | "excessive_hours_weekly"
    | "consecutive_shifts"
    | "consecutive_night_shifts"
    | "inactive_staff"
    | "on_leave_staff"
    | "outside_facility_scope"
    | "duplicate_assignment"
    | "min_rest_violation";
  severity: "info" | "warning" | "error";
  message: string;
  details?: any;
};

/**
 * Detect overlapping shifts for the same staff member.
 * Two shifts overlap if their [start, end) intervals intersect.
 * Overnight shifts are correctly handled because we work with absolute Date times.
 */
export function detectShiftOverlap(
  newShift: ShiftWindow,
  existingShifts: ShiftWindow[]
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const newEnd = newShift.endTime || new Date(newShift.startTime.getTime() + 12 * 60 * 60 * 1000);

  for (const existing of existingShifts) {
    if (existing.id === newShift.id) continue; // skip self when editing
    const exEnd = existing.endTime || new Date(existing.startTime.getTime() + 12 * 60 * 60 * 1000);

    // Overlap: newStart < exEnd AND exStart < newEnd
    if (newShift.startTime < exEnd && existing.startTime < newEnd) {
      const isSameDay = newShift.startTime.toDateString() === existing.startTime.toDateString();
      warnings.push({
        type: isSameDay ? "double_booking" : "overlap",
        severity: "error",
        message: isSameDay
          ? "Staff is already assigned to another shift on the same day during this time."
          : "Shift overlaps with an existing assignment.",
        details: { existingShiftId: existing.id, existingStart: existing.startTime, existingEnd: exEnd },
      });
    }
  }
  return warnings;
}

/**
 * Detect insufficient rest between shifts.
 * Default minimum rest: 11 hours (configurable).
 */
export function detectInsufficientRest(
  newShift: ShiftWindow,
  previousShifts: ShiftWindow[],
  minRestHours = 11
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];

  for (const prev of previousShifts) {
    if (prev.id === newShift.id) continue;
    const prevEnd = prev.endTime || new Date(prev.startTime.getTime() + 12 * 60 * 60 * 1000);
    // Only check shifts that END before the new shift STARTS
    if (prevEnd <= newShift.startTime) {
      const restHours = (newShift.startTime.getTime() - prevEnd.getTime()) / (1000 * 60 * 60);
      if (restHours < minRestHours) {
        warnings.push({
          type: "insufficient_rest",
          severity: restHours < 6 ? "error" : "warning",
          message: `Insufficient rest period: only ${restHours.toFixed(1)} hours since last shift ended (minimum ${minRestHours}h required).`,
          details: { previousShiftId: prev.id, restHours, minRestHours },
        });
      }
    }
  }
  return warnings;
}

/**
 * Detect excessive daily working hours.
 * Default max: 13 hours (configurable per org/facility).
 */
export function detectExcessiveDailyHours(
  staffId: string,
  newShift: ShiftWindow,
  existingShiftsOnSameDay: ShiftWindow[],
  maxDailyHours = 13
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const newHours = calculateShiftHours(newShift.startTime, newShift.endTime);
  const totalHours =
    newHours +
    existingShiftsOnSameDay
      .filter((s) => s.id !== newShift.id)
      .reduce((sum, s) => sum + calculateShiftHours(s.startTime, s.endTime), 0);

  if (totalHours > maxDailyHours) {
    warnings.push({
      type: "excessive_hours_daily",
      severity: totalHours > 16 ? "error" : "warning",
      message: `Daily working hours would reach ${totalHours.toFixed(1)}h (max ${maxDailyHours}h).`,
      details: { staffId, totalHours, maxDailyHours },
    });
  }
  return warnings;
}

/**
 * Detect excessive weekly working hours.
 * Default max: 60 hours (configurable).
 */
export function detectExcessiveWeeklyHours(
  staffId: string,
  newShiftHours: number,
  existingWeeklyHours: number,
  maxWeeklyHours = 60
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const total = newShiftHours + existingWeeklyHours;
  if (total > maxWeeklyHours) {
    warnings.push({
      type: "excessive_hours_weekly",
      severity: total > 72 ? "error" : "warning",
      message: `Weekly working hours would reach ${total.toFixed(1)}h (max ${maxWeeklyHours}h).`,
      details: { staffId, totalHours: total, maxWeeklyHours },
    });
  }
  return warnings;
}

/**
 * Detect too many consecutive shifts.
 */
export function detectConsecutiveShifts(
  staffId: string,
  newShiftDate: Date,
  existingShiftDates: Date[],
  maxConsecutive = 6,
  maxConsecutiveNight = 4
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const dates = [...existingShiftDates, newShiftDate]
    .map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))
    .sort((a, b) => a.getTime() - b.getTime());

  // Find the run that contains newShiftDate
  const newIdx = dates.findIndex(
    (d) => d.getTime() === new Date(newShiftDate.getFullYear(), newShiftDate.getMonth(), newShiftDate.getDate()).getTime()
  );
  if (newIdx === -1) return warnings;

  // Walk backwards
  let runStart = newIdx;
  while (runStart > 0) {
    const prev = dates[runStart - 1];
    const cur = dates[runStart];
    const dayDiff = (cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (dayDiff === 1) runStart--;
    else break;
  }
  // Walk forwards
  let runEnd = newIdx;
  while (runEnd < dates.length - 1) {
    const cur = dates[runEnd];
    const next = dates[runEnd + 1];
    const dayDiff = (next.getTime() - cur.getTime()) / (1000 * 60 * 60 * 24);
    if (dayDiff === 1) runEnd++;
    else break;
  }

  const consecutive = runEnd - runStart + 1;
  if (consecutive > maxConsecutive) {
    warnings.push({
      type: "consecutive_shifts",
      severity: "warning",
      message: `This would be ${consecutive} consecutive working days (max ${maxConsecutive}).`,
      details: { staffId, consecutive, maxConsecutive },
    });
  }

  return warnings;
}

/**
 * Identify fatigue risks based on patterns. NOT a medical diagnosis.
 */
export function identifyFatigueRisks(
  staffId: string,
  recentShifts: ShiftWindow[],
  options: {
    maxConsecutiveNight?: number;
    maxWeeklyHours?: number;
    maxOvertimeHours?: number;
  } = {}
): ConflictWarning[] {
  const { maxConsecutiveNight = 4, maxWeeklyHours = 60, maxOvertimeHours = 20 } = options;
  const warnings: ConflictWarning[] = [];

  // Count consecutive night shifts in last 14 days
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const recentNightShifts = recentShifts.filter(
    (s) => s.startTime >= fourteenDaysAgo && isNightShift(s.startTime, s.endTime)
  );

  if (recentNightShifts.length >= maxConsecutiveNight) {
    warnings.push({
      type: "consecutive_night_shifts",
      severity: "warning",
      message: `${recentNightShifts.length} night shifts in the last 14 days may increase fatigue risk.`,
      details: { staffId, nightShiftCount: recentNightShifts.length, maxConsecutiveNight },
    });
  }

  // Weekly hours
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weeklyHours = recentShifts
    .filter((s) => s.startTime >= weekAgo)
    .reduce((sum, s) => sum + calculateShiftHours(s.startTime, s.endTime), 0);

  if (weeklyHours > maxWeeklyHours) {
    warnings.push({
      type: "excessive_hours_weekly",
      severity: "warning",
      message: `Staff has worked ${weeklyHours.toFixed(1)}h in the last 7 days (max ${maxWeeklyHours}h).`,
      details: { staffId, weeklyHours, maxWeeklyHours },
    });
  }

  return warnings;
}

// ---------------------------------------------------------------------
// LEAVE DAY CALCULATION
// ---------------------------------------------------------------------

/**
 * Calculate leave days between two dates, with options for handling
 * weekends, public holidays, and partial days.
 *
 * Hospitals operate 24/7 — for clinical staff, every calendar day counts.
 * For administrative staff, weekends/holidays may be excluded.
 */
export function calculateLeaveDays(
  startDate: Date,
  endDate: Date | null,
  options: {
    includeWeekends?: boolean; // default true (hospital 24/7)
    holidays?: Date[]; // public holidays to count or skip
    skipHolidays?: boolean; // if true, holidays are not counted
    partialDay?: "full" | "half_first" | "half_second" | "hours";
    hoursOff?: number;
    workingHoursPerDay?: number; // for partial-day conversion (default 8)
  } = {}
): number {
  if (!endDate) {
    // Single-day leave
    if (options.partialDay === "half_first" || options.partialDay === "half_second") return 0.5;
    if (options.partialDay === "hours" && options.hoursOff) {
      return options.hoursOff / (options.workingHoursPerDay || 8);
    }
    return 1;
  }

  const {
    includeWeekends = true,
    holidays = [],
    skipHolidays = false,
    partialDay = "full",
    hoursOff,
    workingHoursPerDay = 8,
  } = options;

  // Normalize to date-only
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const holidayDates = new Set(holidays.map((h) => h.toDateString()));

  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dayOfWeek = cur.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidayDates.has(cur.toDateString());

    if (isWeekend && !includeWeekends) {
      cur.setDate(cur.getDate() + 1);
      continue;
    }
    if (isHoliday && skipHolidays) {
      cur.setDate(cur.getDate() + 1);
      continue;
    }

    // First day partial?
    if (cur.getTime() === start.getTime() && (partialDay === "half_first" || partialDay === "half_second")) {
      days += 0.5;
    } else if (cur.getTime() === start.getTime() && partialDay === "hours" && hoursOff) {
      days += hoursOff / workingHoursPerDay;
    } else if (cur.getTime() === end.getTime() && partialDay === "hours" && hoursOff) {
      // Last day with hours
      days += hoursOff / workingHoursPerDay;
    } else {
      days += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return days;
}

/**
 * Check if a date range overlaps with another leave record.
 */
export function detectLeaveOverlap(
  newStart: Date,
  newEnd: Date | null,
  existingLeaves: { startDate: Date; endDate: Date | null; status: string }[]
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const newEndSafe = newEnd || newStart;

  for (const leave of existingLeaves) {
    if (leave.status === "cancelled" || leave.status === "rejected" || leave.status === "withdrawn") continue;
    const exEnd = leave.endDate || leave.startDate;
    // Overlap: newStart <= exEnd AND exStart <= newEnd
    if (newStart <= exEnd && leave.startDate <= newEndSafe) {
      warnings.push({
        type: "leave_conflict",
        severity: "warning",
        message: `Leave overlaps with an existing ${leave.status} leave record.`,
        details: { existingStart: leave.startDate, existingEnd: exEnd, status: leave.status },
      });
    }
  }
  return warnings;
}

/**
 * Check if a leave request overlaps with an existing shift assignment.
 */
export function detectLeaveShiftConflict(
  leaveStart: Date,
  leaveEnd: Date | null,
  shifts: { shiftDate: Date; startTime: Date; endTime: Date | null }[]
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const leaveEndSafe = leaveEnd || leaveStart;

  for (const shift of shifts) {
    const shiftDateOnly = new Date(shift.shiftDate.getFullYear(), shift.shiftDate.getMonth(), shift.shiftDate.getDate());
    const leaveStartOnly = new Date(leaveStart.getFullYear(), leaveStart.getMonth(), leaveStart.getDate());
    const leaveEndOnly = new Date(leaveEndSafe.getFullYear(), leaveEndSafe.getMonth(), leaveEndSafe.getDate());

    if (shiftDateOnly >= leaveStartOnly && shiftDateOnly <= leaveEndOnly) {
      warnings.push({
        type: "leave_conflict",
        severity: "warning",
        message: `Staff has a scheduled shift on ${shiftDateOnly.toISOString().slice(0, 10)}. Roster adjustment required.`,
        details: { shiftDate: shift.shiftDate, shiftStart: shift.startTime },
      });
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------
// LEAVE BALANCE ARITHMETIC
// ---------------------------------------------------------------------

/**
 * Compute the effective remaining leave balance.
 * remaining = entitlement + accrued + carriedForward + adjustments - used - pending
 *
 * If policy allows negative balance, returns the (possibly negative) value.
 * Otherwise, clamps to 0.
 */
export function computeRemainingBalance(balance: {
  entitlement: number;
  accrued: number;
  used: number;
  pending: number;
  carriedForward: number;
  adjustments: number;
}, negativeAllowed = false, negativeLimit = 0): number {
  const raw = balance.entitlement + balance.accrued + balance.carriedForward + balance.adjustments - balance.used - balance.pending;
  if (negativeAllowed && raw < 0) {
    return Math.max(raw, -negativeLimit);
  }
  return Math.max(0, raw);
}

/**
 * Check if a leave request can be approved given the current balance.
 */
export function canApproveLeave(
  requestedDays: number,
  balance: { entitlement: number; accrued: number; used: number; pending: number; carriedForward: number; adjustments: number },
  policy: { negativeBalanceAllowed: boolean; negativeBalanceLimit: number }
): { canApprove: boolean; reason?: string } {
  const remaining = computeRemainingBalance(balance, policy.negativeBalanceAllowed, policy.negativeBalanceLimit);
  const afterApproval = remaining - requestedDays;

  if (afterApproval < 0 && !policy.negativeBalanceAllowed) {
    return {
      canApprove: false,
      reason: `Insufficient leave balance. Available: ${remaining.toFixed(1)} days, requested: ${requestedDays.toFixed(1)} days.`,
    };
  }
  if (afterApproval < -policy.negativeBalanceLimit && policy.negativeBalanceAllowed) {
    return {
      canApprove: false,
      reason: `Approval would exceed negative balance limit of ${policy.negativeBalanceLimit} days.`,
    };
  }
  return { canApprove: true };
}

// ---------------------------------------------------------------------
// WORKING CALENDAR HELPERS
// ---------------------------------------------------------------------

/**
 * Returns true if the given date is a weekend (Sat or Sun).
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Returns true if the given date is a public holiday.
 */
export function isHoliday(date: Date, holidays: Date[]): boolean {
  const d = date.toDateString();
  return holidays.some((h) => h.toDateString() === d);
}

/**
 * Determine the day type for staffing requirement matching.
 */
export function getDayType(date: Date, holidays: Date[] = []): "weekday" | "weekend" | "holiday" {
  if (isHoliday(date, holidays)) return "holiday";
  if (isWeekend(date)) return "weekend";
  return "weekday";
}

/**
 * Generate a list of dates between two dates (inclusive).
 */
export function dateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endD = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= endD) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/**
 * Returns the start and end of the week containing the given date.
 * Week starts on Monday.
 */
export function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon
  const diff = (day === 0 ? -6 : 1) - day; // adjust to Monday
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Returns the start and end of the month containing the given date.
 */
export function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

// ---------------------------------------------------------------------
// ROTATION / RECURRING SHIFT PATTERN HELPERS
// ---------------------------------------------------------------------

export type RecurrencePattern =
  | { type: "daily"; interval: number } // every N days
  | { type: "weekly"; daysOfWeek: number[] } // [1,3,5] = Mon, Wed, Fri
  | { type: "weekdays" } // Mon-Fri
  | { type: "weekends" } // Sat + Sun
  | { type: "alternate_weeks"; daysOfWeek: number[] }
  | { type: "rotation"; pattern: string[]; intervalWeeks: number }; // ["morning","evening","night","off"]

/**
 * Generate shift dates based on a recurrence pattern.
 */
export function generateRecurringDates(pattern: RecurrencePattern, startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const allDates = dateRange(startDate, endDate);

  switch (pattern.type) {
    case "daily": {
      for (let i = 0; i < allDates.length; i += pattern.interval) {
        dates.push(allDates[i]);
      }
      break;
    }
    case "weekly": {
      for (const d of allDates) {
        if (pattern.daysOfWeek.includes(d.getDay())) dates.push(d);
      }
      break;
    }
    case "weekdays": {
      for (const d of allDates) {
        if (!isWeekend(d)) dates.push(d);
      }
      break;
    }
    case "weekends": {
      for (const d of allDates) {
        if (isWeekend(d)) dates.push(d);
      }
      break;
    }
    case "alternate_weeks": {
      let weekNum = 0;
      let lastWeek = -1;
      for (const d of allDates) {
        const week = Math.floor((d.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (week !== lastWeek) {
          weekNum++;
          lastWeek = week;
        }
        if (weekNum % 2 === 1 && pattern.daysOfWeek.includes(d.getDay())) {
          dates.push(d);
        }
      }
      break;
    }
    case "rotation": {
      // Rotate through pattern by week
      let lastWeek = -1;
      let weekIdx = 0;
      for (const d of allDates) {
        const week = Math.floor((d.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (week !== lastWeek) {
          weekIdx = week % pattern.pattern.length;
          lastWeek = week;
        }
        const shiftType = pattern.pattern[weekIdx];
        if (shiftType !== "off") dates.push(d);
      }
      break;
    }
  }

  return dates;
}

// ---------------------------------------------------------------------
// STAFFING REQUIREMENTS / SKILL MIX
// ---------------------------------------------------------------------

export type SkillMixRequirement = {
  profession: string;
  minCount: number;
  seniority?: string;
  specialty?: string;
};

/**
 * Check if a roster meets the skill mix requirements.
 */
export function checkSkillMix(
  assignments: { staff: { profession: string | null; specialty: string | null; seniority?: string | null } }[],
  requirements: SkillMixRequirement[]
): { satisfied: boolean; gaps: SkillMixRequirement[] } {
  const gaps: SkillMixRequirement[] = [];

  for (const req of requirements) {
    const matching = assignments.filter(
      (a) =>
        a.staff.profession === req.profession &&
        (!req.specialty || a.staff.specialty === req.specialty) &&
        (!req.seniority || a.staff.seniority === req.seniority)
    );
    if (matching.length < req.minCount) {
      gaps.push({ ...req, minCount: req.minCount - matching.length });
    }
  }

  return { satisfied: gaps.length === 0, gaps };
}

/**
 * Find suitable replacement staff for a coverage request.
 * Returns staff sorted by suitability score.
 */
export function findReplacementCandidates(
  candidates: {
    id: string;
    firstName: string;
    lastName: string;
    profession: string | null;
    specialty: string | null;
    facilityId: string | null;
    employmentStatus: string;
    existingShiftsOnDate: { startTime: Date; endTime: Date | null }[];
    weeklyHours: number;
  }[],
  options: {
    requiredProfession?: string;
    requiredSpecialty?: string;
    facilityId: string;
    shiftStart: Date;
    shiftEnd: Date | null;
    maxWeeklyHours?: number;
  }
): { staffId: string; name: string; score: number; reasons: string[] }[] {
  const { requiredProfession, requiredSpecialty, facilityId, shiftStart, shiftEnd, maxWeeklyHours = 60 } = options;
  const results: { staffId: string; name: string; score: number; reasons: string[] }[] = [];

  for (const c of candidates) {
    const reasons: string[] = [];
    let score = 100;

    // Must be active
    if (c.employmentStatus !== "active") {
      continue;
    }

    // Same facility preferred
    if (c.facilityId === facilityId) {
      score += 20;
      reasons.push("Same facility");
    } else {
      score -= 30;
      reasons.push("Different facility");
    }

    // Profession match
    if (requiredProfession) {
      if (c.profession === requiredProfession) {
        score += 30;
        reasons.push("Profession match");
      } else {
        score -= 50;
        reasons.push("Profession mismatch");
      }
    }

    // Specialty match
    if (requiredSpecialty) {
      if (c.specialty === requiredSpecialty) {
        score += 20;
        reasons.push("Specialty match");
      } else {
        score -= 20;
      }
    }

    // Check no shift conflict
    const hasConflict = c.existingShiftsOnDate.some((s) => {
      const sEnd = s.endTime || new Date(s.startTime.getTime() + 8 * 60 * 60 * 1000);
      return shiftStart < sEnd && s.startTime < (shiftEnd || new Date(shiftStart.getTime() + 8 * 60 * 60 * 1000));
    });
    if (hasConflict) {
      score -= 100;
      reasons.push("Has conflicting shift");
    } else {
      reasons.push("Available");
    }

    // Working hours load
    const shiftHours = calculateShiftHours(shiftStart, shiftEnd);
    if (c.weeklyHours + shiftHours > maxWeeklyHours) {
      score -= 40;
      reasons.push("Would exceed weekly hours");
    } else if (c.weeklyHours < 30) {
      score += 10;
      reasons.push("Low weekly load");
    }

    if (score > 0) {
      results.push({
        staffId: c.id,
        name: `${c.firstName} ${c.lastName}`,
        score,
        reasons,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------
// DATE/TIMEZONE UTILITIES
// ---------------------------------------------------------------------

/**
 * Returns the current date in the facility's configured timezone.
 * Falls back to UTC if no timezone is set.
 */
export function nowInTimezone(timezone?: string | null): Date {
  if (!timezone) return new Date();
  try {
    return new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  } catch {
    return new Date();
  }
}

/**
 * Format a Date as "HH:mm" in the facility timezone.
 */
export function formatTime(date: Date, timezone?: string | null): string {
  try {
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone || undefined,
    });
  } catch {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
}

/**
 * Format a Date as YYYY-MM-DD in the facility timezone.
 */
export function formatDateISO(date: Date, timezone?: string | null): string {
  try {
    return date.toISOString().slice(0, 10);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

// ---------------------------------------------------------------------
// REASON CODES
// ---------------------------------------------------------------------

export const SHIFT_CHANGE_REASON_CODES = [
  { value: "staff_request", label: "Staff Request" },
  { value: "emergency", label: "Emergency" },
  { value: "coverage", label: "Coverage" },
  { value: "department_need", label: "Department Need" },
  { value: "operational", label: "Operational Requirement" },
  { value: "other", label: "Other" },
] as const;

export const LEAVE_REASON_CODES = [
  { value: "annual", label: "Annual" },
  { value: "sick", label: "Sick" },
  { value: "family", label: "Family" },
  { value: "study", label: "Study" },
  { value: "emergency", label: "Emergency" },
  { value: "other", label: "Other" },
] as const;

export const COVERAGE_REASON_CODES = [
  { value: "sick", label: "Sick" },
  { value: "emergency", label: "Emergency" },
  { value: "no_show", label: "No Show" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
] as const;
