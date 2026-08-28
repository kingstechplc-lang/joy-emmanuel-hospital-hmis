// =====================================================================
// API: /api/leave/[id]
//   GET    — fetch a leave record
//   PATCH  — update leave / approve / reject (TRANSACTIONAL with balance updates)
//   DELETE — delete leave (only if pending)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { calculateLeaveDays, computeRemainingBalance } from "@/lib/shift-engine";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const leave = await db.leaveRecord.findUnique({
    where: { id },
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      leaveTypeRef: true,
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!leave) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Apply confidentiality filter
  const isSensitive = leave.isSensitive || leave.leaveTypeRef?.isSensitive;
  const canViewSensitive = hasPermission(session, PERMISSIONS.LEAVE_VIEW) || hasPermission(session, PERMISSIONS.LEAVE_MANAGE);
  if (isSensitive && !canViewSensitive) {
    return NextResponse.json({
      item: {
        ...leave,
        reason: null,
        supportingDocUrl: null,
        expectedDeliveryDate: null,
        isSensitive: true,
      },
    });
  }

  return NextResponse.json({ item: leave });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE) && !hasPermission(session, PERMISSIONS.STAFF_MANAGE) && !hasPermission(session, PERMISSIONS.LEAVE_APPROVE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { action, leaveType, startDate, endDate, returnDate, actualReturnDate, reason, reasonCode, status, reviewComment, supportingDocUrl, contactDuringLeave } = body;

  const existing = await db.leaveRecord.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updateData: any = {};
  if (leaveType) updateData.leaveType = leaveType;
  if (startDate) updateData.startDate = new Date(startDate);
  if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
  if (returnDate !== undefined) updateData.returnDate = returnDate ? new Date(returnDate) : null;
  if (actualReturnDate !== undefined) updateData.actualReturnDate = actualReturnDate ? new Date(actualReturnDate) : null;
  if (typeof reason === "string") updateData.reason = reason || null;
  if (reasonCode !== undefined) updateData.reasonCode = reasonCode;
  if (reviewComment !== undefined) updateData.reviewComment = reviewComment;
  if (supportingDocUrl !== undefined) updateData.supportingDocUrl = supportingDocUrl;
  if (contactDuringLeave !== undefined) updateData.contactDuringLeave = contactDuringLeave;

  // ---- ACTION-BASED STATUS TRANSITIONS (TRANSACTIONAL) ----
  if (action === "approve") {
    if (existing.status !== "pending" && existing.status !== "submitted") {
      return NextResponse.json({ error: `Cannot approve a leave in status '${existing.status}'.` }, { status: 400 });
    }

    // Check staffing impact — warn if approval would reduce below minimum
    let staffingWarning: string | null = null;
    if (existing.departmentId) {
      const approvedDates: Date[] = [];
      const start = existing.startDate;
      const end = existing.endDate || existing.startDate;
      const cur = new Date(start);
      while (cur <= end) {
        approvedDates.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      // For each date, count staff on leave in same dept
      for (const d of approvedDates) {
        const onLeaveCount = await db.leaveRecord.count({
          where: {
            staff: { departmentId: existing.departmentId },
            status: "approved",
            startDate: { lte: d },
            OR: [{ endDate: null }, { endDate: { gte: d } }],
            id: { not: id },
          },
        });
        // Just warn — do not block
        if (onLeaveCount >= 3) {
          staffingWarning = `${onLeaveCount} staff in this department are already on approved leave on ${d.toISOString().slice(0, 10)}. Approval may impact staffing.`;
          break;
        }
      }
    }

    // Transaction: approve leave + update balance (move pending → used)
    await db.$transaction(async (tx) => {
      await tx.leaveRecord.update({
        where: { id },
        data: {
          status: "approved",
          approvedById: session.user.id,
          reviewComment: reviewComment || null,
        },
      });

      // Update balance: move pending → used
      if (existing.leaveTypeId) {
        const leaveYear = String(existing.startDate.getFullYear());
        const balance = await tx.leaveBalance.findUnique({
          where: {
            staffId_leaveTypeId_leaveYear: {
              staffId: existing.staffId,
              leaveTypeId: existing.leaveTypeId,
              leaveYear,
            },
          },
        });
        if (balance) {
          const daysRequested = calculateLeaveDays(existing.startDate, existing.endDate, {
            partialDay: (existing.partialDay || "full") as any,
            hoursOff: existing.hoursOff || undefined,
          });
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              pending: { decrement: daysRequested },
              used: { increment: daysRequested },
              remaining: computeRemainingBalance({
                entitlement: balance.entitlement,
                accrued: balance.accrued,
                used: balance.used + daysRequested,
                pending: Math.max(0, balance.pending - daysRequested),
                carriedForward: balance.carriedForward,
                adjustments: balance.adjustments,
              }),
            },
          });
        }
      }

      // Mark staff employmentStatus as on_leave
      await tx.staff.update({
        where: { id: existing.staffId },
        data: { employmentStatus: "on_leave" },
      });
    });

    // Notify staff
    try {
      const staff = await db.staff.findUnique({ where: { id: existing.staffId }, select: { userId: true, firstName: true, lastName: true } });
      if (staff) {
        await db.notification.create({
          data: {
            userId: staff.userId,
            type: "leave_approved",
            title: "Leave Approved",
            message: `Your ${existing.leaveType || ""} leave request has been approved.`,
            referenceType: "leave_record",
            referenceId: id,
          },
        });
      }
    } catch (e) {
      console.error("Notification failed (non-fatal):", e);
    }

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId || undefined,
      action: "LEAVE_APPROVED",
      resourceType: "leave_record",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "approved", approvedById: session.user.id },
      reason: reviewComment,
    });

    return NextResponse.json({ item: { id, status: "approved" }, staffingWarning });
  } else if (action === "reject") {
    // Transaction: reject + restore pending balance
    await db.$transaction(async (tx) => {
      await tx.leaveRecord.update({
        where: { id },
        data: {
          status: "rejected",
          approvedById: session.user.id,
          reviewComment: reviewComment || null,
        },
      });

      // Restore pending balance
      if (existing.leaveTypeId) {
        const leaveYear = String(existing.startDate.getFullYear());
        const balance = await tx.leaveBalance.findUnique({
          where: {
            staffId_leaveTypeId_leaveYear: {
              staffId: existing.staffId,
              leaveTypeId: existing.leaveTypeId,
              leaveYear,
            },
          },
        });
        if (balance) {
          const daysRequested = calculateLeaveDays(existing.startDate, existing.endDate, {
            partialDay: (existing.partialDay || "full") as any,
            hoursOff: existing.hoursOff || undefined,
          });
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              pending: { decrement: daysRequested },
              remaining: computeRemainingBalance({
                ...balance,
                pending: Math.max(0, balance.pending - daysRequested),
              }),
            },
          });
        }
      }
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId || undefined,
      action: "LEAVE_REJECTED",
      resourceType: "leave_record",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "rejected" },
      reason: reviewComment,
    });

    return NextResponse.json({ item: { id, status: "rejected" } });
  } else if (action === "cancel") {
    // Restore pending balance
    await db.$transaction(async (tx) => {
      await tx.leaveRecord.update({
        where: { id },
        data: { status: "cancelled", reviewComment: reviewComment || null },
      });
      if (existing.leaveTypeId) {
        const leaveYear = String(existing.startDate.getFullYear());
        const balance = await tx.leaveBalance.findUnique({
          where: {
            staffId_leaveTypeId_leaveYear: {
              staffId: existing.staffId,
              leaveTypeId: existing.leaveTypeId,
              leaveYear,
            },
          },
        });
        if (balance && existing.status === "pending") {
          const daysRequested = calculateLeaveDays(existing.startDate, existing.endDate, {
            partialDay: (existing.partialDay || "full") as any,
            hoursOff: existing.hoursOff || undefined,
          });
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              pending: { decrement: daysRequested },
              remaining: computeRemainingBalance({
                ...balance,
                pending: Math.max(0, balance.pending - daysRequested),
              }),
            },
          });
        }
      }
      // If was approved, restore used → 0 and set staff back to active
      if (existing.status === "approved") {
        if (existing.leaveTypeId) {
          const leaveYear = String(existing.startDate.getFullYear());
          const balance = await tx.leaveBalance.findUnique({
            where: {
              staffId_leaveTypeId_leaveYear: {
                staffId: existing.staffId,
                leaveTypeId: existing.leaveTypeId,
                leaveYear,
              },
            },
          });
          if (balance) {
            const daysRequested = calculateLeaveDays(existing.startDate, existing.endDate, {
              partialDay: (existing.partialDay || "full") as any,
              hoursOff: existing.hoursOff || undefined,
            });
            await tx.leaveBalance.update({
              where: { id: balance.id },
              data: {
                used: { decrement: daysRequested },
                remaining: computeRemainingBalance({
                  ...balance,
                  used: Math.max(0, balance.used - daysRequested),
                }),
              },
            });
          }
        }
        await tx.staff.update({
          where: { id: existing.staffId },
          data: { employmentStatus: "active" },
        });
      }
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId || undefined,
      action: "LEAVE_CANCELLED",
      resourceType: "leave_record",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "cancelled" },
      reason: reviewComment,
    });

    return NextResponse.json({ item: { id, status: "cancelled" } });
  } else if (action === "complete" || action === "return_to_duty") {
    // Mark return to duty
    await db.$transaction(async (tx) => {
      await tx.leaveRecord.update({
        where: { id },
        data: {
          status: "completed",
          actualReturnDate: actualReturnDate ? new Date(actualReturnDate) : new Date(),
        },
      });
      await tx.staff.update({
        where: { id: existing.staffId },
        data: { employmentStatus: "active" },
      });
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId || undefined,
      action: "LEAVE_RETURN_TO_DUTY",
      resourceType: "leave_record",
      resourceId: id,
      newValues: { status: "completed", actualReturnDate },
    });

    return NextResponse.json({ item: { id, status: "completed" } });
  } else if (typeof status === "string") {
    updateData.status = status;
  }

  // Generic update (no action)
  if (Object.keys(updateData).length > 0) {
    const updated = await db.leaveRecord.update({ where: { id }, data: updateData });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId || undefined,
      action: "LEAVE_UPDATED",
      resourceType: "leave_record",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: updateData,
    });
    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ item: existing });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE) && !hasPermission(session, PERMISSIONS.LEAVE_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.leaveRecord.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only allow delete if pending — otherwise just mark cancelled
  if (existing.status !== "pending" && existing.status !== "draft") {
    return NextResponse.json({ error: "Cannot delete a leave record that has been processed. Use cancel instead." }, { status: 400 });
  }

  await db.leaveRecord.delete({ where: { id } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "LEAVE_DELETED",
    resourceType: "leave_record",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
