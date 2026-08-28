// API: /api/training-programs/[id] — GET / PATCH / DELETE
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
  const item = await db.trainingProgram.findUnique({
    where: { id },
    include: {
      facility: true, department: true, provider: true, trainer: true,
      sessions: { orderBy: { sessionDate: "asc" }, take: 20 },
      _count: { select: { enrollments: true, certificates: true, requirements: true } },
    },
  });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_EDIT) && !hasPermission(session, PERMISSIONS.TRAINING_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.trainingProgram.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  if (updateData.targetStaff && typeof updateData.targetStaff !== "string") updateData.targetStaff = JSON.stringify(updateData.targetStaff);
  if (updateData.durationHours !== undefined) updateData.durationHours = updateData.durationHours ? parseFloat(updateData.durationHours) : null;
  if (updateData.cpdPoints !== undefined) updateData.cpdPoints = updateData.cpdPoints ? parseFloat(updateData.cpdPoints) : null;
  if (updateData.cost !== undefined) updateData.cost = updateData.cost ? parseFloat(updateData.cost) : 0;
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.trainingProgram.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "TRAINING_PROGRAM_UPDATED", resourceType: "training_program", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_DELETE) && !hasPermission(session, PERMISSIONS.TRAINING_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.trainingProgram.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Soft delete — archive
  await db.trainingProgram.update({ where: { id }, data: { status: "archived" } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "TRAINING_PROGRAM_ARCHIVED", resourceType: "training_program", resourceId: id });
  return NextResponse.json({ ok: true });
}
