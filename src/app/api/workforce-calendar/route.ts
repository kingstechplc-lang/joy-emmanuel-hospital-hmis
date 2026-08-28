// =====================================================================
// API: /api/workforce-calendar
//   GET — combined calendar view: shifts + leave + holidays + on-call
//   Returns events for a date range with type/color labels.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const departmentId = url.searchParams.get("departmentId");
  const staffId = url.searchParams.get("staffId");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  // Default to current month if no range provided
  const now = new Date();
  const start = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = dateTo ? new Date(dateTo) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  // Fetch all events in parallel
  const [shifts, leaves, holidays, onCall] = await Promise.all([
    // Shifts
    db.staffShift.findMany({
      where: {
        facilityId: facilityId ? facilityId : { in: orgFacilityIds },
        shiftDate: { gte: start, lte: end },
        ...(departmentId ? { departmentId } : {}),
        ...(staffId ? { staffId } : {}),
      },
      select: {
        id: true,
        staffId: true,
        shiftDate: true,
        startTime: true,
        endTime: true,
        shiftType: true,
        status: true,
        isOnCall: true,
        isOvernight: true,
        staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
        facility: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    }),
    // Leave
    db.leaveRecord.findMany({
      where: {
        startDate: { lte: end },
        OR: [{ endDate: null }, { endDate: { gte: start } }],
        ...(staffId ? { staffId } : {}),
        ...(facilityId ? { facilityId } : {}),
        ...(departmentId ? { departmentId } : {}),
      },
      select: {
        id: true,
        staffId: true,
        leaveType: true,
        startDate: true,
        endDate: true,
        status: true,
        isSensitive: true,
        staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true } },
      },
    }),
    // Holidays
    db.holiday.findMany({
      where: {
        organizationId: session.user.organizationId,
        active: true,
        date: { gte: start, lte: end },
        ...(facilityId ? { OR: [{ facilityId: null }, { facilityId }] } : {}),
      },
      select: { id: true, name: true, date: true, type: true },
    }),
    // On-call
    db.onCallSchedule.findMany({
      where: {
        facilityId: facilityId ? facilityId : { in: orgFacilityIds },
        startDate: { lte: end },
        OR: [{ endDate: null }, { endDate: { gte: start } }],
        ...(departmentId ? { departmentId } : {}),
        ...(staffId ? { staffId } : {}),
      },
      select: {
        id: true,
        staffId: true,
        startDate: true,
        endDate: true,
        isPrimary: true,
        isBackup: true,
        status: true,
        staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true } },
        facility: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Apply confidentiality filter for leave
  const canViewSensitive = hasPermission(session, PERMISSIONS.LEAVE_VIEW) || hasPermission(session, PERMISSIONS.LEAVE_MANAGE);

  // Normalize events into a unified calendar format
  const events: any[] = [
    // Shifts
    ...shifts.map((s) => ({
      id: s.id,
      type: "shift",
      shiftType: s.shiftType,
      status: s.status,
      isOnCall: s.isOnCall,
      isOvernight: s.isOvernight,
      staffId: s.staffId,
      staffName: `${s.staff.firstName} ${s.staff.lastName}`,
      staffNumber: s.staff.staffNumber,
      facility: s.facility,
      department: s.department,
      start: s.startTime,
      end: s.endTime,
      date: s.shiftDate,
      color: s.isOnCall ? "#9333ea" : s.shiftType === "night" ? "#1e40af" : s.shiftType === "evening" ? "#c2410c" : "#16a34a",
    })),
    // Leave (filtered for sensitivity)
    ...leaves
      .filter((l) => l.status !== "cancelled" && l.status !== "rejected")
      .map((l) => ({
        id: l.id,
        type: "leave",
        leaveType: l.leaveType,
        status: l.status,
        isSensitive: l.isSensitive,
        staffId: l.staffId,
        staffName: `${l.staff.firstName} ${l.staff.lastName}`,
        staffNumber: l.staff.staffNumber,
        start: l.startDate,
        end: l.endDate || l.startDate,
        date: l.startDate,
        // Hide reason for sensitive leave unless user has permission
        reason: l.isSensitive && !canViewSensitive ? null : undefined,
        color: l.status === "approved" ? "#16a34a" : l.status === "pending" ? "#ca8a04" : "#dc2626",
      })),
    // Holidays
    ...holidays.map((h) => ({
      id: h.id,
      type: "holiday",
      name: h.name,
      holidayType: h.type,
      start: h.date,
      end: h.date,
      date: h.date,
      color: "#db2777",
    })),
    // On-call
    ...onCall
      .filter((o) => o.status !== "cancelled")
      .map((o) => ({
        id: o.id,
        type: "on_call",
        isPrimary: o.isPrimary,
        isBackup: o.isBackup,
        status: o.status,
        staffId: o.staffId,
        staffName: `${o.staff.firstName} ${o.staff.lastName}`,
        staffNumber: o.staff.staffNumber,
        facility: o.facility,
        department: o.department,
        start: o.startDate,
        end: o.endDate || o.startDate,
        date: o.startDate,
        color: "#7c3aed",
      })),
  ];

  return NextResponse.json({
    events,
    count: events.length,
    dateRange: { start, end },
    filters: { facilityId, departmentId, staffId },
  });
}
