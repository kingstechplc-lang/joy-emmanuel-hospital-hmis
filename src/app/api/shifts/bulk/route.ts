// =====================================================================
// API: /api/shifts/bulk — POST (bulk shift assignment with validation)
//   Validates each assignment for conflicts, leave, and rest period.
//   Returns per-assignment success/failure. Transactional where possible.
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
  type ConflictWarning,
} from "@/lib/shift-engine";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

type AssignmentInput = {
  staffId: string;
  facilityId: string;
  departmentId?: string;
  shiftDate: string;
  startTime: string;
  endTime?: string;
  shiftType?: string;
  shiftTypeId?: string;
  rosterId?: string;
  supervisorId?: string;
  notes?: string;
};

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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { assignments, skipConflicts } = body as { assignments: AssignmentInput[]; skipConflicts?: boolean };

  if (!Array.isArray(assignments) || assignments.length === 0) {
    return NextResponse.json({ error: "assignments (non-empty array) is required" }, { status: 400 });
  }

  if (assignments.length > 500) {
    return NextResponse.json({ error: "Maximum 500 assignments per bulk request." }, { status: 400 });
  }

  // Pre-validate all facilities belong to org
  const facilityIds = [...new Set(assignments.map((a) => a.facilityId))];
  const facilities = await db.facility.findMany({
    where: { id: { in: facilityIds } },
    select: { id: true, organizationId: true },
  });
  const orgFacilityIds = new Set(
    facilities.filter((f) => f.organizationId === session.user.organizationId).map((f) => f.id)
  );
  for (const a of assignments) {
    if (!orgFacilityIds.has(a.facilityId)) {
      return NextResponse.json({ error: `Invalid facility: ${a.facilityId}` }, { status: 400 });
    }
  }

  // Validate all staff belong to org
  const staffIds = [...new Set(assignments.map((a) => a.staffId))];
  const staffRecords = await db.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, employmentStatus: true, user: { select: { organizationId: true } } },
  });
  const orgStaffMap = new Map(
    staffRecords
      .filter((s) => s.user.organizationId === session.user.organizationId)
      .map((s) => [s.id, s])
  );

  const results: {
    index: number;
    staffId: string;
    success: boolean;
    shiftId?: string;
    error?: string;
    warnings?: ConflictWarning[];
  }[] = [];

  // Process each assignment — collect conflicts and errors first
  type ValidAssignment = {
    index: number;
    input: AssignmentInput;
    startDate: Date;
    endDate: Date | null;
    warnings: ConflictWarning[];
  };
  const validAssignments: ValidAssignment[] = [];

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    const staff = orgStaffMap.get(a.staffId);
    if (!staff) {
      results.push({ index: i, staffId: a.staffId, success: false, error: "Invalid staff or outside organization." });
      continue;
    }
    if (staff.employmentStatus !== "active") {
      results.push({ index: i, staffId: a.staffId, success: false, error: `Staff is not active (status: ${staff.employmentStatus}).` });
      continue;
    }
    if (!a.shiftDate || !a.startTime) {
      results.push({ index: i, staffId: a.staffId, success: false, error: "shiftDate and startTime are required." });
      continue;
    }

    const startDate = new Date(a.startTime);
    const endDate = a.endTime ? new Date(a.endTime) : null;
    const shiftDate = new Date(a.shiftDate);

    // Validate dates
    if (isNaN(startDate.getTime())) {
      results.push({ index: i, staffId: a.staffId, success: false, error: "Invalid startTime." });
      continue;
    }

    // Check leave conflicts
    const leaveConflicts = await db.leaveRecord.findMany({
      where: {
        staffId: a.staffId,
        status: { in: ["approved", "pending"] },
        startDate: { lte: shiftDate },
        OR: [{ endDate: null }, { endDate: { gte: shiftDate } }],
      },
      select: { id: true, startDate: true, endDate: true, status: true, leaveType: true },
    });
    const approvedLeaves = leaveConflicts.filter((l) => l.status === "approved");
    if (approvedLeaves.length > 0) {
      results.push({
        index: i,
        staffId: a.staffId,
        success: false,
        error: `Staff is on approved ${approvedLeaves[0].leaveType || ""} leave on this date.`,
      });
      continue;
    }

    // Check shift conflicts (overlap)
    const existingShifts = await db.staffShift.findMany({
      where: {
        staffId: a.staffId,
        status: { in: ["scheduled", "checked_in", "on_break"] },
        shiftDate: {
          gte: new Date(shiftDate.getTime() - 24 * 60 * 60 * 1000),
          lte: new Date(shiftDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      select: { id: true, startTime: true, endTime: true },
    });

    const newShiftWindow = { startTime: startDate, endTime: endDate };
    const overlapWarnings = detectShiftOverlap(newShiftWindow, existingShifts);
    const restWarnings = detectInsufficientRest(newShiftWindow, existingShifts);

    // Hard errors block creation unless skipConflicts is set
    const hardErrors = [...overlapWarnings, ...restWarnings].filter((w) => w.severity === "error");
    if (hardErrors.length > 0 && !skipConflicts) {
      results.push({
        index: i,
        staffId: a.staffId,
        success: false,
        error: hardErrors[0].message,
        warnings: [...overlapWarnings, ...restWarnings],
      });
      continue;
    }

    validAssignments.push({
      index: i,
      input: a,
      startDate,
      endDate,
      warnings: [...overlapWarnings, ...restWarnings],
    });
  }

  // Create valid assignments in a transaction
  if (validAssignments.length > 0) {
    try {
      const created = await db.$transaction(async (tx) => {
        const items: { index: number; shiftId: string; staffId: string; warnings: ConflictWarning[] }[] = [];
        for (const va of validAssignments) {
          const hours = calculateShiftHours(va.startDate, va.endDate);
          const overnight = isOvernightShift(va.startDate, va.endDate);
          const shift = await tx.staffShift.create({
            data: {
              staffId: va.input.staffId,
              facilityId: va.input.facilityId,
              departmentId: va.input.departmentId || null,
              shiftDate: new Date(va.input.shiftDate),
              startTime: va.startDate,
              endTime: va.endDate,
              shiftType: va.input.shiftType || "morning",
              shiftTypeId: va.input.shiftTypeId || null,
              rosterId: va.input.rosterId || null,
              supervisorId: va.input.supervisorId || null,
              status: "scheduled",
              isOvernight: overnight,
              workingHours: hours,
              notes: va.input.notes,
            },
          });
          items.push({ index: va.index, shiftId: shift.id, staffId: va.input.staffId, warnings: va.warnings });
        }
        return items;
      });

      for (const c of created) {
        results.push({
          index: c.index,
          staffId: c.staffId,
          success: true,
          shiftId: c.shiftId,
          warnings: c.warnings,
        });
      }

      // Audit log (single entry for the bulk action)
      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        action: "BULK_SHIFT_ASSIGNED",
        resourceType: "staff_shift",
        newValues: { count: created.length, totalRequested: assignments.length },
      });
    } catch (e: any) {
      // If transaction fails, mark all valid assignments as failed
      for (const va of validAssignments) {
        results.push({
          index: va.index,
          staffId: va.input.staffId,
          success: false,
          error: `Database error: ${e.message}`,
        });
      }
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    results,
    summary: {
      total: assignments.length,
      succeeded,
      failed,
    },
  }, { status: failed === assignments.length ? 400 : 201 });
}
