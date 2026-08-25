// =====================================================================
// API: /api/rooms
//   GET  — list rooms (filter by wardId, facilityId, status)
//   POST — create a new room
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW) && !hasPermission(session, PERMISSIONS.BED_VIEW) && !hasPermission(session, PERMISSIONS.BED_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const wardId = url.searchParams.get("wardId");
  const status = url.searchParams.get("status");

  const where: any = {};
  if (wardId) where.wardId = wardId;
  if (status) where.status = status;

  const rooms = await db.room.findMany({
    where,
    orderBy: [{ wardId: "asc" }, { roomNumber: "asc" }],
    include: {
      ward: { select: { id: true, name: true, code: true } },
      _count: { select: { beds: true } },
    },
  });
  return NextResponse.json({ items: rooms, count: rooms.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BED_CREATE) && !hasPermission(session, PERMISSIONS.BED_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden — missing bed.create permission" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { wardId, roomNumber, roomType, capacity, status } = body;

  if (!wardId || !roomNumber) {
    return NextResponse.json({ error: "wardId and roomNumber are required" }, { status: 400 });
  }

  // Verify ward exists
  const ward = await db.ward.findUnique({ where: { id: wardId } });
  if (!ward) return NextResponse.json({ error: "Ward not found" }, { status: 404 });

  // Check for duplicate room number in ward
  const existing = await db.room.findFirst({ where: { wardId, roomNumber } });
  if (existing) {
    return NextResponse.json({ error: "Room with this number already exists in this ward" }, { status: 409 });
  }

  const room = await db.room.create({
    data: {
      wardId,
      roomNumber,
      roomType: roomType || "ward",
      capacity: typeof capacity === "number" ? capacity : 1,
      status: status || "active",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: ward.facilityId,
    action: "ROOM_CREATED",
    resourceType: "room",
    resourceId: room.id,
    newValues: { wardId, roomNumber, roomType, capacity },
  });

  return NextResponse.json({ item: room }, { status: 201 });
}
