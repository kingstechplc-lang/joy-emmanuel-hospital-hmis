// =====================================================================
// API: /api/seed-workforce-defaults — POST
//   Seeds default ShiftTypes, LeaveTypes, and Holidays for the org.
//   Idempotent — skips existing entries.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const DEFAULT_SHIFT_TYPES = [
  { name: "Morning", code: "MORNING", category: "regular", colorHex: "#16a34a", startTime: "08:00", endTime: "16:00", overnight: false, isOnCall: false, defaultBreakMinutes: 60, workingHours: 8, sortOrder: 1 },
  { name: "Afternoon", code: "AFTERNOON", category: "regular", colorHex: "#ca8a04", startTime: "12:00", endTime: "20:00", overnight: false, isOnCall: false, defaultBreakMinutes: 60, workingHours: 8, sortOrder: 2 },
  { name: "Evening", code: "EVENING", category: "regular", colorHex: "#c2410c", startTime: "16:00", endTime: "00:00", overnight: false, isOnCall: false, defaultBreakMinutes: 60, workingHours: 8, sortOrder: 3 },
  { name: "Night", code: "NIGHT", category: "rotational", colorHex: "#1e40af", startTime: "19:00", endTime: "07:00", overnight: true, isOnCall: false, defaultBreakMinutes: 60, workingHours: 12, sortOrder: 4 },
  { name: "Night 12-Hour", code: "NIGHT-12", category: "rotational", colorHex: "#1e3a8a", startTime: "19:00", endTime: "07:00", overnight: true, isOnCall: false, defaultBreakMinutes: 60, workingHours: 12, sortOrder: 5 },
  { name: "Day 12-Hour", code: "DAY-12", category: "rotational", colorHex: "#0e7490", startTime: "07:00", endTime: "19:00", overnight: false, isOnCall: false, defaultBreakMinutes: 60, workingHours: 12, sortOrder: 6 },
  { name: "24-Hour", code: "H24", category: "fixed", colorHex: "#7c2d12", startTime: "08:00", endTime: "08:00", overnight: true, isOnCall: false, defaultBreakMinutes: 180, workingHours: 24, sortOrder: 7 },
  { name: "On-Call", code: "ON_CALL", category: "on_call", colorHex: "#9333ea", startTime: null, endTime: null, overnight: false, isOnCall: true, defaultBreakMinutes: 0, workingHours: null, sortOrder: 8 },
  { name: "Emergency", code: "EMERGENCY", category: "emergency", colorHex: "#dc2626", startTime: null, endTime: null, overnight: false, isOnCall: false, defaultBreakMinutes: 0, workingHours: null, sortOrder: 9 },
  { name: "Weekend", code: "WEEKEND", category: "weekend", colorHex: "#be185d", startTime: "08:00", endTime: "20:00", overnight: false, isOnCall: false, defaultBreakMinutes: 60, workingHours: 12, sortOrder: 10 },
  { name: "Public Holiday Duty", code: "HOLIDAY", category: "holiday", colorHex: "#db2777", startTime: "08:00", endTime: "20:00", overnight: false, isOnCall: false, defaultBreakMinutes: 60, workingHours: 12, sortOrder: 11 },
];

const DEFAULT_LEAVE_TYPES = [
  { name: "Annual Leave", code: "ANNUAL", category: "paid", colorHex: "#16a34a", defaultDays: 30, accrualRatePerMonth: 2.5, carryForwardLimit: 15, carryForwardExpiryMonths: 3, minDurationDays: 1, maxDurationDays: 30, noticePeriodDays: 7, requiresDocumentation: false, requiresApprovalHierarchy: true, isSensitive: false, sortOrder: 1 },
  { name: "Sick Leave", code: "SICK", category: "paid", colorHex: "#dc2626", defaultDays: 14, accrualRatePerMonth: 1.17, carryForwardLimit: 0, carryForwardExpiryMonths: 0, minDurationDays: 0.5, maxDurationDays: 90, noticePeriodDays: 0, requiresDocumentation: true, requiresApprovalHierarchy: true, isSensitive: true, sortOrder: 2 },
  { name: "Maternity Leave", code: "MATERNITY", category: "paid", colorHex: "#db2777", defaultDays: 84, accrualRatePerMonth: 0, carryForwardLimit: 0, carryForwardExpiryMonths: 0, minDurationDays: 1, maxDurationDays: 120, noticePeriodDays: 30, requiresDocumentation: true, requiresApprovalHierarchy: true, isSensitive: true, sortOrder: 3 },
  { name: "Paternity Leave", code: "PATERNITY", category: "paid", colorHex: "#0891b2", defaultDays: 5, accrualRatePerMonth: 0, carryForwardLimit: 0, carryForwardExpiryMonths: 0, minDurationDays: 1, maxDurationDays: 14, noticePeriodDays: 7, requiresDocumentation: true, requiresApprovalHierarchy: true, isSensitive: false, sortOrder: 4 },
  { name: "Compassionate Leave", code: "COMPASSIONATE", category: "paid", colorHex: "#7c3aed", defaultDays: 3, accrualRatePerMonth: 0, carryForwardLimit: 0, carryForwardExpiryMonths: 0, minDurationDays: 1, maxDurationDays: 7, noticePeriodDays: 0, requiresDocumentation: false, requiresApprovalHierarchy: true, isSensitive: false, sortOrder: 5 },
  { name: "Bereavement Leave", code: "BEREAVEMENT", category: "paid", colorHex: "#6b7280", defaultDays: 5, accrualRatePerMonth: 0, carryForwardLimit: 0, carryForwardExpiryMonths: 0, minDurationDays: 1, maxDurationDays: 14, noticePeriodDays: 0, requiresDocumentation: false, requiresApprovalHierarchy: true, isSensitive: false, sortOrder: 6 },
  { name: "Study Leave", code: "STUDY", category: "paid", colorHex: "#0e7490", defaultDays: 10, accrualRatePerMonth: 0, carryForwardLimit: 0, carryForwardExpiryMonths: 0, minDurationDays: 1, maxDurationDays: 30, noticePeriodDays: 14, requiresDocumentation: true, requiresApprovalHierarchy: true, isSensitive: false, sortOrder: 7 },
  { name: "Emergency Leave", code: "EMERGENCY", category: "paid", colorHex: "#ea580c", defaultDays: 3, accrualRatePerMonth: 0, carryForwardLimit: 0, carryForwardExpiryMonths: 0, minDurationDays: 0.5, maxDurationDays: 5, noticePeriodDays: 0, requiresDocumentation: false, requiresApprovalHierarchy: true, isSensitive: false, sortOrder: 8 },
  { name: "Unpaid Leave", code: "UNPAID", category: "unpaid", colorHex: "#9ca3af", defaultDays: 0, accrualRatePerMonth: 0, carryForwardLimit: 0, carryForwardExpiryMonths: 0, minDurationDays: 1, maxDurationDays: 365, noticePeriodDays: 14, requiresDocumentation: false, requiresApprovalHierarchy: true, isSensitive: false, sortOrder: 9 },
  { name: "Public Duty Leave", code: "PUBLIC_DUTY", category: "special", colorHex: "#15803d", defaultDays: 5, accrualRatePerMonth: 0, carryForwardLimit: 0, carryForwardExpiryMonths: 0, minDurationDays: 1, maxDurationDays: 14, noticePeriodDays: 7, requiresDocumentation: true, requiresApprovalHierarchy: true, isSensitive: false, sortOrder: 10 },
  { name: "Special Leave", code: "SPECIAL", category: "special", colorHex: "#be185d", defaultDays: 0, accrualRatePerMonth: 0, carryForwardLimit: 0, carryForwardExpiryMonths: 0, minDurationDays: 1, maxDurationDays: 30, noticePeriodDays: 7, requiresDocumentation: true, requiresApprovalHierarchy: true, isSensitive: false, sortOrder: 11 },
];

const DEFAULT_HOLIDAYS = (year: number) => [
  { name: "New Year's Day", date: `${year}-01-01`, type: "public", isRecurring: true },
  { name: "Independence Day", date: `${year}-03-06`, type: "public", isRecurring: true },
  { name: "Good Friday", date: `${year}-03-29`, type: "religious", isRecurring: false },
  { name: "Easter Monday", date: `${year}-04-01`, type: "religious", isRecurring: false },
  { name: "May Day (Labour Day)", date: `${year}-05-01`, type: "public", isRecurring: true },
  { name: "Eid al-Fitr", date: `${year}-04-10`, type: "religious", isRecurring: false },
  { name: "Eid al-Adha", date: `${year}-06-16`, type: "religious", isRecurring: false },
  { name: "Founders' Day", date: `${year}-08-04`, type: "public", isRecurring: true },
  { name: "Kwame Nkrumah Memorial Day", date: `${year}-09-21`, type: "public", isRecurring: true },
  { name: "Christmas Day", date: `${year}-12-25`, type: "religious", isRecurring: true },
  { name: "Boxing Day", date: `${year}-12-26`, type: "public", isRecurring: true },
];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE) && !hasPermission(session, PERMISSIONS.LEAVE_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.organizationId;
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  const facilityId = body.facilityId || null;
  const year = body.year || new Date().getFullYear();

  const results = {
    shiftTypesCreated: 0,
    shiftTypesSkipped: 0,
    leaveTypesCreated: 0,
    leaveTypesSkipped: 0,
    holidaysCreated: 0,
    holidaysSkipped: 0,
  };

  // ---- SHIFT TYPES ----
  for (const st of DEFAULT_SHIFT_TYPES) {
    const existing = await db.shiftType.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: st.code } },
    });
    if (existing) {
      results.shiftTypesSkipped++;
      continue;
    }
    await db.shiftType.create({
      data: {
        organizationId: orgId,
        facilityId,
        name: st.name,
        code: st.code,
        category: st.category,
        colorHex: st.colorHex,
        startTime: st.startTime,
        endTime: st.endTime,
        overnight: st.overnight,
        isOnCall: st.isOnCall,
        defaultBreakMinutes: st.defaultBreakMinutes,
        workingHours: st.workingHours,
        sortOrder: st.sortOrder,
        paidBreak: true,
      },
    });
    results.shiftTypesCreated++;
  }

  // ---- LEAVE TYPES ----
  for (const lt of DEFAULT_LEAVE_TYPES) {
    const existing = await db.leaveType.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: lt.code } },
    });
    if (existing) {
      results.leaveTypesSkipped++;
      continue;
    }
    await db.leaveType.create({
      data: {
        organizationId: orgId,
        facilityId,
        name: lt.name,
        code: lt.code,
        category: lt.category,
        colorHex: lt.colorHex,
        defaultDays: lt.defaultDays,
        accrualRatePerMonth: lt.accrualRatePerMonth,
        carryForwardLimit: lt.carryForwardLimit,
        carryForwardExpiryMonths: lt.carryForwardExpiryMonths,
        minDurationDays: lt.minDurationDays,
        maxDurationDays: lt.maxDurationDays,
        noticePeriodDays: lt.noticePeriodDays,
        requiresDocumentation: lt.requiresDocumentation,
        requiresApprovalHierarchy: lt.requiresApprovalHierarchy,
        isSensitive: lt.isSensitive,
        sortOrder: lt.sortOrder,
      },
    });
    results.leaveTypesCreated++;
  }

  // ---- HOLIDAYS ----
  for (const h of DEFAULT_HOLIDAYS(year)) {
    const existing = await db.holiday.findUnique({
      where: {
        organizationId_date_name: {
          organizationId: orgId,
          date: new Date(h.date),
          name: h.name,
        },
      },
    }).catch(() => null);
    if (existing) {
      results.holidaysSkipped++;
      continue;
    }
    try {
      await db.holiday.create({
        data: {
          organizationId: orgId,
          facilityId,
          name: h.name,
          date: new Date(h.date),
          type: h.type,
          isRecurring: h.isRecurring,
        },
      });
      results.holidaysCreated++;
    } catch (e) {
      // Skip duplicates silently
      results.holidaysSkipped++;
    }
  }

  await auditLog({
    userId: session.user.id,
    organizationId: orgId,
    action: "WORKFORCE_DEFAULTS_SEEDED",
    resourceType: "organization",
    resourceId: orgId,
    newValues: results,
  });

  return NextResponse.json({ ok: true, results, year });
}
