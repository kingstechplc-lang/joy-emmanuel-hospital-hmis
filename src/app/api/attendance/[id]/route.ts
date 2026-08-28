// API: /api/attendance/[id] — GET / PATCH / DELETE
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
