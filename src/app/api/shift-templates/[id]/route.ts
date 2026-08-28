// API: /api/shift-templates/[id] — GET / PATCH / DELETE
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.shiftTemplate.findUnique({ where: { id }, include: { shiftType: true } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.shiftTemplate.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, code, shiftTypeId, facilityId, departmentId, startTime, endTime, breakMinutes, paidBreak, overnight, isOnCall, category, workingHours, minStaff, requiredSkillMix, description, active } = body;
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (code !== undefined) updateData.code = code;
  if (shiftTypeId !== undefined) updateData.shiftTypeId = shiftTypeId || null;
  if (facilityId !== undefined) updateData.facilityId = facilityId || null;
  if (departmentId !== undefined) updateData.departmentId = departmentId || null;
  if (startTime !== undefined) updateData.startTime = startTime;
  if (endTime !== undefined) updateData.endTime = endTime;
  if (breakMinutes !== undefined) updateData.breakMinutes = breakMinutes;
  if (paidBreak !== undefined) updateData.paidBreak = paidBreak;
  if (overnight !== undefined) updateData.overnight = overnight;
  if (isOnCall !== undefined) updateData.isOnCall = isOnCall;
  if (category !== undefined) updateData.category = category;
  if (workingHours !== undefined) updateData.workingHours = workingHours;
  if (minStaff !== undefined) updateData.minStaff = minStaff;
  if (requiredSkillMix !== undefined) updateData.requiredSkillMix = requiredSkillMix ? JSON.stringify(requiredSkillMix) : null;
  if (description !== undefined) updateData.description = description;
  if (active !== undefined) updateData.active = active;
  const updated = await db.shiftTemplate.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "SHIFT_TEMPLATE_UPDATED", resourceType: "shift_template", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.shiftTemplate.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.shiftTemplate.update({ where: { id }, data: { active: false } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "SHIFT_TEMPLATE_DEACTIVATED", resourceType: "shift_template", resourceId: id });
  return NextResponse.json({ ok: true });
}
