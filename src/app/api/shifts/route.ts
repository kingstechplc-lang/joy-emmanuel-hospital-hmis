// =====================================================================
// API: /api/shifts
//   GET  — list staff shifts (filter by facility, date range, staff, shift type)
//   POST — create a new staff shift (with conflict + leave validation)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  detectShiftOverlap,
  detectInsufficientRest,
  calculateShiftHours,
  isOvernightShift,
  isNightShift,
  type ConflictWarning,
} from "@/lib/shift-engine";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

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
  const departmentId = url.searchParams.get("departmentId");

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
  if (departmentId) where.departmentId = departmentId;
  if (dateFrom || dateTo) {
    where.shiftDate = {};
    if (dateFrom) where.shiftDate.gte = new Date(dateFrom);
    if (dateTo) where.shiftDate.lte = new Date(dateTo);
  }

  const shifts = await db.staffShift.findMany({
    where,
    orderBy: [{ shiftDate: "desc" }, { startTime: "desc" }],
    take: 500,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true } },
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      shiftTypeRef: true,
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
    shiftTypeRef: s.shiftTypeRef,
    shiftCategoryId: s.shiftTypeId,
    rosterId: s.rosterId,
    supervisorId: s.supervisorId,
    status: s.status,
    shiftCategory: s.shiftCategory,
    isOnCall: s.isOnCall,
    isOvernight: s.isOvernight,
    workingHours: s.workingHours,
    overtimeMinutes: s.overtimeMinutes,
    notes: s.notes,
  }));

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_ASSIGN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { staffId, facilityId, departmentId, shiftDate, startTime, endTime, shiftType, shiftTypeId, rosterId, supervisorId, notes, skipConflicts } = body;

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
  if (staff.employmentStatus !== "active") {
    return NextResponse.json({ error: `Staff is not active (status: ${staff.employmentStatus}).` }, { status: 400 });
  }

  const startDate = new Date(startTime);
  const endDate = endTime ? new Date(endTime) : null;
  const shiftDateObj = new Date(shiftDate);

  // ---- LEAVE CONFLICT VALIDATION ----
  const approvedLeave = await db.leaveRecord.findFirst({
    where: {
      staffId,
      status: "approved",
      startDate: { lte: shiftDateObj },
      OR: [{ endDate: null }, { endDate: { gte: shiftDateObj } }],
    },
  });
  if (approvedLeave) {
    return NextResponse.json({
      error: `Staff is on approved ${approvedLeave.leaveType || ""} leave on this date.`,
    }, { status: 400 });
  }

  // ---- SHIFT CONFLICT VALIDATION ----
  const existingShifts = await db.staffShift.findMany({
    where: {
      staffId,
      status: { in: ["scheduled", "checked_in", "on_break"] },
      shiftDate: {
        gte: new Date(shiftDateObj.getTime() - 24 * 60 * 60 * 1000),
        lte: new Date(shiftDateObj.getTime() + 24 * 60 * 60 * 1000),
      },
    },
    select: { id: true, startTime: true, endTime: true },
  });

  const newShiftWindow = { startTime: startDate, endTime: endDate };
  const overlapWarnings = detectShiftOverlap(newShiftWindow, existingShifts);
  const restWarnings = detectInsufficientRest(newShiftWindow, existingShifts);
  const allWarnings: ConflictWarning[] = [...overlapWarnings, ...restWarnings];
  const hardErrors = allWarnings.filter((w) => w.severity === "error");

  if (hardErrors.length > 0 && !skipConflicts) {
    return NextResponse.json({
      error: hardErrors[0].message,
      conflictWarnings: allWarnings,
    }, { status: 409 });
  }

  // ---- CREATE SHIFT (transactional) ----
  const hours = calculateShiftHours(startDate, endDate);
  const overnight = isOvernightShift(startDate, endDate);
  const nightShift = isNightShift(startDate, endDate);

  const shift = await db.staffShift.create({
    data: {
      staffId,
      facilityId,
      departmentId: departmentId || null,
      shiftDate: shiftDateObj,
      startTime: startDate,
      endTime: endDate,
      shiftType: shiftType || "morning",
      shiftTypeId: shiftTypeId || null,
      rosterId: rosterId || null,
      supervisorId: supervisorId || null,
      status: "scheduled",
      shiftCategory: nightShift ? "rotational" : "regular",
      isOvernight: overnight,
      isOnCall: shiftType === "on_call",
      workingHours: hours,
      notes,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "SHIFT_CREATED",
    resourceType: "staff_shift",
    resourceId: shift.id,
    newValues: { staffId, facilityId, shiftDate, shiftType, workingHours: hours },
  });

  return NextResponse.json({ item: shift, conflictWarnings: allWarnings }, { status: 201 });
}
