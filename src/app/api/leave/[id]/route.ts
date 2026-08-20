// =====================================================================
// API: /api/leave/[id]
//   GET    — fetch a leave record
//   PATCH  — update leave / approve / reject
//   DELETE — delete leave
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
  const leave = await db.leaveRecord.findUnique({
    where: { id },
    include: { staff: true },
  });
  if (!leave) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item: leave });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE) && !hasPermission(session, PERMISSIONS.STAFF_MANAGE)) {
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
  const { action, leaveType, startDate, endDate, reason, status } = body;

  const existing = await db.leaveRecord.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updateData: any = {};
  if (leaveType) updateData.leaveType = leaveType;
  if (startDate) updateData.startDate = new Date(startDate);
  if (endDate) updateData.endDate = new Date(endDate);
  if (typeof reason === "string") updateData.reason = reason || null;

  if (action === "approve") {
    updateData.status = "approved";
    updateData.approvedById = session.user.id;
  } else if (action === "reject") {
    updateData.status = "rejected";
    updateData.approvedById = session.user.id;
  } else if (action === "cancel") {
    updateData.status = "cancelled";
  } else if (typeof status === "string") {
    updateData.status = status;
  }

  const updated = await db.leaveRecord.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: action ? `LEAVE_${action.toUpperCase()}` : "LEAVE_UPDATED",
    resourceType: "leave_record",
    resourceId: id,
    oldValues: { status: existing.status },
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
  const existing = await db.leaveRecord.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.leaveRecord.delete({ where: { id } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "LEAVE_DELETED",
    resourceType: "leave_record",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
