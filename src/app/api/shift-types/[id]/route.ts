// =====================================================================
// API: /api/shift-types/[id]
//   GET / PATCH / DELETE
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const item = await db.shiftType.findUnique({ where: { id } });
  if (!item || item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.shiftType.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { name, code, category, colorHex, startTime, endTime, overnight, isOnCall, defaultBreakMinutes, paidBreak, workingHours, description, active, sortOrder } = body;
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (code !== undefined) updateData.code = code;
  if (category !== undefined) updateData.category = category;
  if (colorHex !== undefined) updateData.colorHex = colorHex;
  if (startTime !== undefined) updateData.startTime = startTime;
  if (endTime !== undefined) updateData.endTime = endTime;
  if (overnight !== undefined) updateData.overnight = overnight;
  if (isOnCall !== undefined) updateData.isOnCall = isOnCall;
  if (defaultBreakMinutes !== undefined) updateData.defaultBreakMinutes = defaultBreakMinutes;
  if (paidBreak !== undefined) updateData.paidBreak = paidBreak;
  if (workingHours !== undefined) updateData.workingHours = workingHours;
  if (description !== undefined) updateData.description = description;
  if (active !== undefined) updateData.active = active;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

  const updated = await db.shiftType.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SHIFT_TYPE_UPDATED",
    resourceType: "shift_type",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.shiftType.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Soft delete — just deactivate
  await db.shiftType.update({ where: { id }, data: { active: false } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SHIFT_TYPE_DEACTIVATED",
    resourceType: "shift_type",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
