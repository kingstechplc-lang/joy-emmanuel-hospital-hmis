// API: /api/training-enrollments/[id] — GET / PATCH / DELETE
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
  const item = await db.trainingEnrollment.findUnique({ where: { id }, include: { staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } }, program: { select: { id: true, title: true } }, session: { select: { id: true, sessionDate: true, startTime: true, endTime: true } } } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_ENROLL) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.trainingEnrollment.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  delete body.id;
  delete body.organizationId;
  const updated = await db.trainingEnrollment.update({ where: { id }, data: body });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "TRAINING_ENROLLMENTS_UPDATED", resourceType: "trainingEnrollment", resourceId: id, oldValues: existing, newValues: body });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_ENROLL) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.trainingEnrollment.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Soft delete — deactivate instead of deleting
  try { await db.trainingEnrollment.update({ where: { id }, data: { status: "archived" } }); } catch { await db.trainingEnrollment.delete({ where: { id } }); }
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "TRAINING_ENROLLMENTS_DELETED", resourceType: "trainingEnrollment", resourceId: id });
  return NextResponse.json({ ok: true });
}
