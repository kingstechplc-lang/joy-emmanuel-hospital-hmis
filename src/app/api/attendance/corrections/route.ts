// API: /api/attendance/corrections — GET (list) + POST (create correction request)
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
