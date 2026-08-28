// API: /api/attendance/overtime/[id] — GET / PATCH
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
