// =====================================================================
// API: /api/rooms/[id]
//   GET    — single room with beds
//   PATCH  — update room fields
//   DELETE — soft-delete (status = "inactive")
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
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW) && !hasPermission(session, PERMISSIONS.BED_VIEW) && !hasPermission(session, PERMISSIONS.BED_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const room = await db.room.findUnique({
    where: { id },
    include: {
      ward: { select: { id: true, name: true, code: true } },
      beds: { orderBy: { bedNumber: "asc" }, select: { id: true, bedNumber: true, bedType: true, status: true, lifecycleStatus: true } },
    },
  });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  return NextResponse.json({ item: room });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BED_EDIT) && !hasPermission(session, PERMISSIONS.BED_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden — missing bed.edit permission" }, { status: 403 });
  }
  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const existing = await db.room.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const { roomNumber, roomType, capacity, status } = body;
  const updateData: any = {};
  if (typeof roomNumber === "string") updateData.roomNumber = roomNumber;
  if (typeof roomType === "string") updateData.roomType = roomType;
  if (typeof capacity === "number") updateData.capacity = capacity;
  if (typeof status === "string") updateData.status = status;

  // Check duplicate room number if changing
  if (updateData.roomNumber && updateData.roomNumber !== existing.roomNumber) {
    const dup = await db.room.findFirst({ where: { wardId: existing.wardId, roomNumber: updateData.roomNumber } });
    if (dup && dup.id !== id) {
      return NextResponse.json({ error: "Room number already in use in this ward" }, { status: 409 });
    }
  }

  const updated = await db.room.update({ where: { id }, data: updateData });
  await auditLog({
    userId: session.user.id, organizationId: session.user.organizationId,
    action: "ROOM_UPDATED", resourceType: "room", resourceId: id,
    oldValues: { roomNumber: existing.roomNumber, status: existing.status },
    newValues: updateData,
  });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BED_RETIRE) && !hasPermission(session, PERMISSIONS.BED_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden — missing bed.retire permission" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.room.findUnique({ where: { id }, include: { _count: { select: { beds: true } } } });
  if (!existing) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  // Check for active bed assignments in this room's beds
  const activeAssignments = await db.bedAssignment.count({
    where: { status: "active", bed: { roomId: id } },
  });
  if (activeAssignments > 0) {
    return NextResponse.json({ error: `Cannot deactivate room — ${activeAssignments} active bed assignment(s) still exist.` }, { status: 400 });
  }

  // Soft-delete: set status to inactive
  await db.room.update({ where: { id }, data: { status: "inactive" } });
  await auditLog({
    userId: session.user.id, organizationId: session.user.organizationId,
    action: "ROOM_DEACTIVATED", resourceType: "room", resourceId: id,
    oldValues: { roomNumber: existing.roomNumber },
  });
  return NextResponse.json({ ok: true });
}
