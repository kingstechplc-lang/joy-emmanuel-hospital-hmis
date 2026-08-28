// =====================================================================
// API: /api/leave
//   GET  — list leave records (filter by staff, status, type, facility, dept)
//   POST — create leave request (with balance + conflict validation)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  calculateLeaveDays,
  detectLeaveOverlap,
  detectLeaveShiftConflict,
  computeRemainingBalance,
  canApproveLeave,
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
  const staffId = url.searchParams.get("staffId");
  const status = url.searchParams.get("status");
  const leaveType = url.searchParams.get("leaveType");
  const facilityId = url.searchParams.get("facilityId");
  const departmentId = url.searchParams.get("departmentId");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  // Scope to user's org
  const orgUsers = await db.user.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const userIds = orgUsers.map((u) => u.id);
  const orgStaff = await db.staff.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const staffIds = orgStaff.map((s) => s.id);

  const where: any = { staffId: { in: staffIds } };
  if (staffId) where.staffId = staffId;
  if (status) where.status = status;
  if (leaveType) where.leaveType = leaveType;
  if (facilityId) where.facilityId = facilityId;
  if (departmentId) where.departmentId = departmentId;
  if (dateFrom || dateTo) {
    where.startDate = {};
    if (dateFrom) where.startDate.gte = new Date(dateFrom);
    if (dateTo) where.startDate.lte = new Date(dateTo);
  }

  const leaves = await db.leaveRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true, departmentId: true, facilityId: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      leaveTypeRef: { select: { id: true, name: true, code: true, colorHex: true, isSensitive: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // Apply confidentiality filter — non-HR users don't see sensitive (sick/maternity) details
  const canViewSensitive = hasPermission(session, PERMISSIONS.LEAVE_VIEW) || hasPermission(session, PERMISSIONS.LEAVE_MANAGE);
  const items = leaves.map((l) => {
    const isSensitive = l.isSensitive || l.leaveTypeRef?.isSensitive;
    if (isSensitive && !canViewSensitive) {
      return {
        id: l.id,
        staffId: l.staffId,
        staff: l.staff,
        facility: l.facility,
        department: l.department,
        leaveType: l.leaveType,
        leaveTypeRef: l.leaveTypeRef ? { id: l.leaveTypeRef.id, name: l.leaveTypeRef.name, code: l.leaveTypeRef.code, colorHex: l.leaveTypeRef.colorHex } : null,
        startDate: l.startDate,
        endDate: l.endDate,
        status: l.status,
        // Reason is hidden — minimum necessary access
        reason: null,
        supportingDocUrl: null,
        isSensitive: true,
      };
    }
    return {
      ...l,
      isSensitive: !!isSensitive,
    };
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEAVE_REQUEST) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE) && !hasPermission(session, PERMISSIONS.STAFF_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const {
    staffId,
    facilityId,
    departmentId,
    leaveType,
    leaveTypeId,
    startDate,
    endDate,
    returnDate,
    reason,
    reasonCode,
    partialDay,
    hoursOff,
    supportingDocUrl,
    contactDuringLeave,
    expectedDeliveryDate,
    institution,
    courseName,
  } = body;

  if (!staffId || !startDate) {
    return NextResponse.json({ error: "staffId, startDate are required" }, { status: 400 });
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

  const startDateObj = new Date(startDate);
  const endDateObj = endDate ? new Date(endDate) : null;

  // ---- VALIDATE AGAINST EXISTING LEAVE ----
  const existingLeaves = await db.leaveRecord.findMany({
    where: {
      staffId,
      status: { in: ["approved", "pending", "extended"] },
    },
    select: { id: true, startDate: true, endDate: true, status: true, leaveType: true },
  });

  const leaveWarnings: ConflictWarning[] = detectLeaveOverlap(startDateObj, endDateObj, existingLeaves);

  // ---- VALIDATE AGAINST EXISTING SHIFTS (roster impact) ----
  const shiftsInRange = await db.staffShift.findMany({
    where: {
      staffId,
      status: { in: ["scheduled", "checked_in", "on_break"] },
      shiftDate: endDateObj
        ? { gte: startDateObj, lte: endDateObj }
        : { gte: startDateObj, lte: new Date(startDateObj.getTime() + 24 * 60 * 60 * 1000) },
    },
    select: { id: true, shiftDate: true, startTime: true, endTime: true },
  });

  const shiftWarnings: ConflictWarning[] = detectLeaveShiftConflict(startDateObj, endDateObj, shiftsInRange);
  const allWarnings = [...leaveWarnings, ...shiftWarnings];

  // ---- LEAVE BALANCE PRE-CHECK (informational — doesn't block submission) ----
  let balanceCheck: any = null;
  if (leaveTypeId) {
    const leaveYear = String(startDateObj.getFullYear());
    const balance = await db.leaveBalance.findUnique({
      where: {
        staffId_leaveTypeId_leaveYear: {
          staffId,
          leaveTypeId,
          leaveYear,
        },
      },
    });
    if (balance) {
      const requestedDays = calculateLeaveDays(startDateObj, endDateObj, {
        partialDay: partialDay || "full",
        hoursOff,
      });
      const policy = await db.leavePolicy.findFirst({
        where: { leaveTypeId, organizationId: session.user.organizationId, active: true },
      });
      const canApprove = canApproveLeave(
        requestedDays,
        {
          entitlement: balance.entitlement,
          accrued: balance.accrued,
          used: balance.used,
          pending: balance.pending,
          carriedForward: balance.carriedForward,
          adjustments: balance.adjustments,
        },
        {
          negativeBalanceAllowed: policy?.negativeBalanceAllowed || false,
          negativeBalanceLimit: policy?.negativeBalanceLimit || 0,
        }
      );
      balanceCheck = {
        requestedDays,
        currentRemaining: computeRemainingBalance(balance, policy?.negativeBalanceAllowed || false, policy?.negativeBalanceLimit || 0),
        canApprove: canApprove.canApprove,
        reason: canApprove.reason,
      };
    }
  }

  // ---- DETERMINE SENSITIVITY ----
  const isSensitiveType = ["sick", "maternity"].includes(leaveType || "") || (await db.leaveType.findUnique({ where: { id: leaveTypeId } }))?.isSensitive;

  // ---- CREATE LEAVE REQUEST ----
  const leave = await db.leaveRecord.create({
    data: {
      staffId,
      facilityId: facilityId || staff.facilityId || null,
      departmentId: departmentId || staff.departmentId || null,
      leaveType,
      leaveTypeId: leaveTypeId || null,
      startDate: startDateObj,
      endDate: endDateObj,
      returnDate: returnDate ? new Date(returnDate) : (endDateObj ? new Date(endDateObj.getTime() + 24 * 60 * 60 * 1000) : null),
      reason,
      reasonCode,
      partialDay: partialDay || "full",
      hoursOff,
      supportingDocUrl,
      contactDuringLeave,
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      institution,
      courseName,
      status: "pending",
      isSensitive: !!isSensitiveType,
    },
  });

  // Update pending balance if we have a balance record
  if (leaveTypeId && balanceCheck) {
    try {
      const leaveYear = String(startDateObj.getFullYear());
      await db.leaveBalance.update({
        where: {
          staffId_leaveTypeId_leaveYear: {
            staffId,
            leaveTypeId,
            leaveYear,
          },
        },
        data: { pending: { increment: balanceCheck.requestedDays } },
      });
    } catch (e) {
      console.error("Failed to update pending balance (non-fatal):", e);
    }
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: facilityId || staff.facilityId || undefined,
    action: "LEAVE_REQUESTED",
    resourceType: "leave_record",
    resourceId: leave.id,
    newValues: { staffId, leaveType, startDate, endDate, reason },
  });

  // Notify approvers
  try {
    const approvers = await db.user.findMany({
      where: {
        organizationId: session.user.organizationId,
        status: "active",
        userRoles: {
          some: {
            role: {
              permissions: {
                some: {
                  permission: { code: { in: [PERMISSIONS.LEAVE_APPROVE, PERMISSIONS.SHIFT_MANAGE] } },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    for (const ap of approvers) {
      await db.notification.create({
        data: {
          userId: ap.id,
          facilityId: facilityId || staff.facilityId || null,
          type: "leave_submitted",
          title: "Leave Request Submitted",
          message: `${staff.firstName} ${staff.lastName} submitted a ${leaveType || ""} leave request.`,
          referenceType: "leave_record",
          referenceId: leave.id,
        },
      });
    }
  } catch (e) {
    console.error("Notification failed (non-fatal):", e);
  }

  return NextResponse.json({
    item: leave,
    conflictWarnings: allWarnings,
    balanceCheck,
  }, { status: 201 });
}
