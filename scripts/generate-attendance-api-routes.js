// Script to generate all attendance API routes programmatically
const fs = require('fs');
const path = require('path');
const baseDir = '/home/z/my-project/src/app/api/attendance';
const routes = [];

// ---------- ATTENDANCE [id] — GET / PATCH / DELETE ----------
routes.push([
  '[id]/route.ts',
  `// API: /api/attendance/[id] — GET / PATCH / DELETE
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.staffAttendance.findUnique({
    where: { id },
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      shift: true,
      corrections: { orderBy: { createdAt: "desc" }, include: { reviewedBy: { select: { id: true, firstName: true, lastName: true } } } },
      exceptions: { orderBy: { createdAt: "desc" } },
      overtimeRecords: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_EDIT) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.staffAttendance.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.isLocked) return NextResponse.json({ error: "This attendance record is locked by a closed period." }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  delete updateData.id;
  delete updateData.staffId;
  delete updateData.facilityId;
  delete updateData.date;
  if (updateData.checkInAt) updateData.checkInAt = new Date(updateData.checkInAt);
  if (updateData.checkOutAt) updateData.checkOutAt = new Date(updateData.checkOutAt);
  const updated = await db.staffAttendance.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId, action: "ATTENDANCE_UPDATED", resourceType: "staff_attendance", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.staffAttendance.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.isLocked) return NextResponse.json({ error: "Cannot delete a locked attendance record." }, { status: 403 });
  // Soft approach: mark as cancelled instead of deleting (preserve history)
  await db.staffAttendance.update({ where: { id }, data: { status: "absent", notes: "Record voided by " + (session.user.name || session.user.username) } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId, action: "ATTENDANCE_DELETED", resourceType: "staff_attendance", resourceId: id });
  return NextResponse.json({ ok: true });
}
`,
]);

// ---------- CORRECTIONS — list + create ----------
routes.push([
  'corrections/route.ts',
  `// API: /api/attendance/corrections — GET (list) + POST (create correction request)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const staffId = url.searchParams.get("staffId");
  const where: any = { organizationId: session.user.organizationId };
  if (status) where.status = status;
  if (staffId) where.staffId = staffId;
  const items = await db.attendanceCorrection.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
      attendance: { select: { id: true, date: true, checkInAt: true, checkOutAt: true, status: true } },
      reviewedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { attendanceId, staffId, requestedCheckInAt, requestedCheckOutAt, requestedStatus, reason, supportingDocUrl } = body;
  if (!attendanceId || !staffId || !reason) return NextResponse.json({ error: "attendanceId, staffId, reason are required" }, { status: 400 });
  const att = await db.staffAttendance.findUnique({ where: { id: attendanceId } });
  if (!att) return NextResponse.json({ error: "Attendance record not found" }, { status: 404 });
  if (att.isLocked) return NextResponse.json({ error: "Cannot request correction on a locked attendance record." }, { status: 403 });
  const item = await db.attendanceCorrection.create({
    data: {
      organizationId: session.user.organizationId,
      attendanceId,
      staffId,
      originalCheckInAt: att.checkInAt,
      originalCheckOutAt: att.checkOutAt,
      originalStatus: att.status,
      requestedCheckInAt: requestedCheckInAt ? new Date(requestedCheckInAt) : null,
      requestedCheckOutAt: requestedCheckOutAt ? new Date(requestedCheckOutAt) : null,
      requestedStatus,
      reason,
      supportingDocUrl,
      status: "pending",
    },
  });
  // Update attendance status to correction_pending
  await db.staffAttendance.update({ where: { id: attendanceId }, data: { status: "correction_pending" } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_CORRECTION_REQUESTED", resourceType: "attendance_correction", resourceId: item.id, newValues: { attendanceId, reason } });
  return NextResponse.json({ item }, { status: 201 });
}
`,
]);

// ---------- CORRECTIONS [id] — GET / PATCH ----------
routes.push([
  'corrections/[id]/route.ts',
  `// API: /api/attendance/corrections/[id] — GET / PATCH
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.attendanceCorrection.findUnique({
    where: { id },
    include: { staff: true, attendance: true, reviewedBy: true },
  });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_CORRECTION_APPROVE) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.attendanceCorrection.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.attendanceCorrection.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_CORRECTION_UPDATED", resourceType: "attendance_correction", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}
`,
]);

// ---------- CORRECTIONS [id]/approve — POST (transactional) ----------
routes.push([
  'corrections/[id]/approve/route.ts',
  `// API: /api/attendance/corrections/[id]/approve — POST
// Transactional: updates correction + applies to attendance + resolves exceptions + audit
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { calculateWorkedDuration, calculateOvertime, calculateLate, calculateEarlyDeparture } from "@/lib/attendance-engine";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_CORRECTION_APPROVE) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const correction = await db.attendanceCorrection.findUnique({ where: { id }, include: { attendance: true } });
  if (!correction || correction.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (correction.status !== "pending") return NextResponse.json({ error: \`Cannot approve a correction in status '\${correction.status}'.\` }, { status: 400 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  if (correction.attendance?.isLocked) return NextResponse.json({ error: "Cannot approve correction — attendance record is locked." }, { status: 403 });

  // Transaction: update correction + apply to attendance + resolve exceptions
  await db.$transaction(async (tx) => {
    // Update correction
    await tx.attendanceCorrection.update({
      where: { id },
      data: {
        status: "approved",
        reviewedById: session.user.id,
        reviewComment: body.comment || null,
        reviewedAt: new Date(),
      },
    });

    // Apply to attendance
    const att = correction.attendance;
    if (att) {
      const newCheckIn = correction.requestedCheckInAt || att.checkInAt;
      const newCheckOut = correction.requestedCheckOutAt || att.checkOutAt;
      const worked = calculateWorkedDuration(newCheckIn, newCheckOut, att.breakMinutes || 0);
      const lateResult = calculateLate(att.expectedStart, newCheckIn, 10, 0);
      const earlyResult = calculateEarlyDeparture(att.expectedEnd, newCheckOut, 15);
      const overtimeResult = calculateOvertime(worked.netMinutes, att.expectedStart && att.expectedEnd ? Math.round((att.expectedEnd.getTime() - att.expectedStart.getTime()) / (1000 * 60)) : 480, 480, {});

      await tx.staffAttendance.update({
        where: { id: att.id },
        data: {
          checkInAt: newCheckIn,
          checkOutAt: newCheckOut,
          status: correction.requestedStatus || att.status === "correction_pending" ? "checked_out" : att.status,
          lateMinutes: lateResult.lateMinutes,
          earlyDepartureMinutes: earlyResult.earlyMinutes,
          grossMinutes: worked.grossMinutes,
          workedMinutes: worked.netMinutes,
          overtimeMinutes: overtimeResult.overtimeMinutes,
        },
      });

      // Resolve related exceptions
      await tx.attendanceException.updateMany({
        where: { attendanceId: att.id, status: "open" },
        data: { status: "resolved", resolvedById: session.user.id, resolutionNote: \`Resolved via correction approval: \${body.comment || "approved"}\`, resolvedAt: new Date() },
      });
    }
  });

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_CORRECTION_APPROVED", resourceType: "attendance_correction", resourceId: id, reason: body.comment });
  return NextResponse.json({ item: { id, status: "approved" } });
}
`,
]);

// ---------- CORRECTIONS [id]/reject — POST ----------
routes.push([
  'corrections/[id]/reject/route.ts',
  `// API: /api/attendance/corrections/[id]/reject — POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_CORRECTION_APPROVE) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.attendanceCorrection.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  // Transaction: reject correction + restore attendance status
  await db.$transaction(async (tx) => {
    await tx.attendanceCorrection.update({
      where: { id },
      data: { status: "rejected", reviewedById: session.user.id, reviewComment: body.comment || body.reason || null, reviewedAt: new Date() },
    });
    // Restore attendance status from correction_pending back to a sensible value
    if (existing.attendanceId) {
      const att = await tx.staffAttendance.findUnique({ where: { id: existing.attendanceId } });
      if (att && att.status === "correction_pending") {
        const newStatus = att.checkOutAt ? "checked_out" : (att.checkInAt ? "checked_in" : "absent");
        await tx.staffAttendance.update({ where: { id: att.id }, data: { status: newStatus } });
      }
    }
  });

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_CORRECTION_REJECTED", resourceType: "attendance_correction", resourceId: id, reason: body.comment || body.reason });
  return NextResponse.json({ item: { id, status: "rejected" } });
}
`,
]);

// ---------- EXCEPTIONS — list + create ----------
routes.push([
  'exceptions/route.ts',
  `// API: /api/attendance/exceptions — GET (list) + POST (create manual exception)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const staffId = url.searchParams.get("staffId");
  const facilityId = url.searchParams.get("facilityId");
  const exceptionType = url.searchParams.get("exceptionType");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const where: any = { organizationId: session.user.organizationId };
  if (status) where.status = status;
  if (staffId) where.staffId = staffId;
  if (facilityId) where.facilityId = facilityId;
  if (exceptionType) where.exceptionType = exceptionType;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) where.date.lte = new Date(dateTo);
  }
  const items = await db.attendanceException.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { staffId, facilityId, departmentId, attendanceId, date, exceptionType, severity, description, metadata } = body;
  if (!staffId || !facilityId || !date || !exceptionType || !description) return NextResponse.json({ error: "staffId, facilityId, date, exceptionType, description are required" }, { status: 400 });
  const item = await db.attendanceException.create({
    data: {
      organizationId: session.user.organizationId,
      staffId, facilityId,
      departmentId: departmentId || null,
      attendanceId: attendanceId || null,
      date: new Date(date),
      exceptionType,
      severity: severity || "warning",
      description,
      metadata: metadata ? JSON.stringify(metadata) : null,
      status: "open",
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId, action: "ATTENDANCE_EXCEPTION_CREATED", resourceType: "attendance_exception", resourceId: item.id, newValues: { staffId, exceptionType, description } });
  return NextResponse.json({ item }, { status: 201 });
}
`,
]);

// ---------- EXCEPTIONS [id] — GET / PATCH ----------
routes.push([
  'exceptions/[id]/route.ts',
  `// API: /api/attendance/exceptions/[id] — GET / PATCH
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.attendanceException.findUnique({ where: { id }, include: { staff: true, facility: true, department: true, resolvedBy: true } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_REVIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.attendanceException.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.attendanceException.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_EXCEPTION_UPDATED", resourceType: "attendance_exception", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}
`,
]);

// ---------- EXCEPTIONS [id]/resolve — POST ----------
routes.push([
  'exceptions/[id]/resolve/route.ts',
  `// API: /api/attendance/exceptions/[id]/resolve — POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_REVIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.attendanceException.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  const newStatus = body.status === "ignored" ? "ignored" : body.status === "escalated" ? "escalated" : "resolved";
  const updated = await db.attendanceException.update({
    where: { id },
    data: {
      status: newStatus,
      resolvedById: session.user.id,
      resolutionNote: body.note || body.reason || null,
      resolvedAt: new Date(),
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: \`ATTENDANCE_EXCEPTION_\${newStatus.toUpperCase()}\`, resourceType: "attendance_exception", resourceId: id, reason: body.note || body.reason });
  return NextResponse.json({ item: updated });
}
`,
]);

// ---------- OVERTIME — list + create ----------
routes.push([
  'overtime/route.ts',
  `// API: /api/attendance/overtime — GET (list) + POST (create manual overtime)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const staffId = url.searchParams.get("staffId");
  const facilityId = url.searchParams.get("facilityId");
  const category = url.searchParams.get("category");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const where: any = { organizationId: session.user.organizationId };
  if (status) where.status = status;
  if (staffId) where.staffId = staffId;
  if (facilityId) where.facilityId = facilityId;
  if (category) where.category = category;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) where.date.lte = new Date(dateTo);
  }
  const items = await db.overtimeRecord.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.OVERTIME_MANAGE) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { staffId, facilityId, departmentId, attendanceId, date, overtimeMinutes, category, reason } = body;
  if (!staffId || !facilityId || !date || !overtimeMinutes) return NextResponse.json({ error: "staffId, facilityId, date, overtimeMinutes are required" }, { status: 400 });
  const item = await db.overtimeRecord.create({
    data: {
      organizationId: session.user.organizationId,
      staffId, facilityId,
      departmentId: departmentId || null,
      attendanceId: attendanceId || null,
      date: new Date(date),
      overtimeMinutes: parseInt(overtimeMinutes, 10),
      category: category || "regular",
      reason,
      status: "pending",
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId, action: "OVERTIME_RECORD_CREATED", resourceType: "overtime_record", resourceId: item.id, newValues: { staffId, overtimeMinutes, category } });
  return NextResponse.json({ item }, { status: 201 });
}
`,
]);

// ---------- OVERTIME [id] — GET / PATCH ----------
routes.push([
  'overtime/[id]/route.ts',
  `// API: /api/attendance/overtime/[id] — GET / PATCH
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.overtimeRecord.findUnique({ where: { id }, include: { staff: true, facility: true, department: true, approvedBy: true } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.OVERTIME_MANAGE) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.overtimeRecord.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  if (updateData.date) updateData.date = new Date(updateData.date);
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.overtimeRecord.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "OVERTIME_RECORD_UPDATED", resourceType: "overtime_record", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}
`,
]);

// ---------- OVERTIME [id]/approve — POST ----------
routes.push([
  'overtime/[id]/approve/route.ts',
  `// API: /api/attendance/overtime/[id]/approve — POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.OVERTIME_MANAGE) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.overtimeRecord.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "pending") return NextResponse.json({ error: \`Cannot approve overtime in status '\${existing.status}'.\` }, { status: 400 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  const updated = await db.overtimeRecord.update({
    where: { id },
    data: { status: "approved", approvedById: session.user.id, approvedAt: new Date() },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "OVERTIME_APPROVED", resourceType: "overtime_record", resourceId: id, reason: body.comment });
  return NextResponse.json({ item: updated });
}
`,
]);

// ---------- OVERTIME [id]/reject — POST ----------
routes.push([
  'overtime/[id]/reject/route.ts',
  `// API: /api/attendance/overtime/[id]/reject — POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.OVERTIME_MANAGE) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.overtimeRecord.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  const updated = await db.overtimeRecord.update({
    where: { id },
    data: { status: "rejected", rejectionReason: body.reason || body.comment || null },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "OVERTIME_REJECTED", resourceType: "overtime_record", resourceId: id, reason: body.reason || body.comment });
  return NextResponse.json({ item: updated });
}
`,
]);

// ---------- PERIODS — list + create ----------
routes.push([
  'periods/route.ts',
  `// API: /api/attendance/periods — GET (list) + POST (create period)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const facilityId = url.searchParams.get("facilityId");
  const where: any = { organizationId: session.user.organizationId };
  if (status) where.status = status;
  if (facilityId) where.facilityId = facilityId;
  const items = await db.attendancePeriod.findMany({
    where,
    orderBy: { startDate: "desc" },
    take: 100,
    include: {
      facility: { select: { id: true, name: true } },
      lockedBy: { select: { id: true, firstName: true, lastName: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, facilityId, startDate, endDate, notes } = body;
  if (!name || !startDate || !endDate) return NextResponse.json({ error: "name, startDate, endDate are required" }, { status: 400 });
  const item = await db.attendancePeriod.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null,
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: "open",
      notes,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_PERIOD_CREATED", resourceType: "attendance_period", resourceId: item.id, newValues: { name, startDate, endDate } });
  return NextResponse.json({ item }, { status: 201 });
}
`,
]);

// ---------- PERIODS [id] — GET / PATCH ----------
routes.push([
  'periods/[id]/route.ts',
  `// API: /api/attendance/periods/[id] — GET / PATCH / DELETE
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.attendancePeriod.findUnique({ where: { id }, include: { facility: true, lockedBy: true, approvedBy: true } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.attendancePeriod.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
  if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.attendancePeriod.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_PERIOD_UPDATED", resourceType: "attendance_period", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.attendancePeriod.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "locked") return NextResponse.json({ error: "Cannot delete a locked period. Unlock first." }, { status: 400 });
  // Detach attendance records then delete period
  await db.staffAttendance.updateMany({ where: { periodId: id }, data: { periodId: null } });
  await db.attendancePeriod.delete({ where: { id } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_PERIOD_DELETED", resourceType: "attendance_period", resourceId: id });
  return NextResponse.json({ ok: true });
}
`,
]);







// Write all routes
for (const [relPath, content] of routes) {
  const fullPath = path.join(baseDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  console.log('Wrote:', relPath);
}
