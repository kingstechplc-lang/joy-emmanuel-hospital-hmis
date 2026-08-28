// API: /api/training-attendance/[id] — GET / PATCH
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_VIEW) && !hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.trainingAttendance.findUnique({ where: { id }, include: { staff: true, session: true, enrollment: true } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_ATTENDANCE_RECORD) && !hasPermission(session, PERMISSIONS.TRAINING_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.trainingAttendance.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  if (updateData.checkInAt) updateData.checkInAt = new Date(updateData.checkInAt);
  if (updateData.checkOutAt) updateData.checkOutAt = new Date(updateData.checkOutAt);
  // Recalculate attended minutes
  if (existing.checkInAt && (updateData.checkOutAt || existing.checkOutAt)) {
    const inDate = existing.checkInAt;
    const outDate = updateData.checkOutAt || existing.checkOutAt;
    updateData.attendedMinutes = Math.floor((outDate.getTime() - inDate.getTime()) / (1000 * 60));
  }
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.trainingAttendance.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "TRAINING_ATTENDANCE_UPDATED", resourceType: "training_attendance", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}
