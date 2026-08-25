// =====================================================================
// API: /api/beds/[id]/reservations
//   GET  — list reservations for a bed
//   POST — create a reservation
//   DELETE — cancel a reservation (?reservationId=...)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_VIEW) && !session.user.permissions?.includes(PERMISSIONS.BED_MANAGE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const reservations = await db.bedReservation.findMany({
    where: { bedId: id },
    orderBy: { reservedAt: "desc" },
    take: 30,
  });
  return NextResponse.json({ items: reservations, count: reservations.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.BED_MANAGE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const bed = await db.bed.findUnique({ where: { id } });
  if (!bed) return NextResponse.json({ error: "Bed not found" }, { status: 404 });
  if (bed.status !== "available") {
    return NextResponse.json({ error: `Bed is not available (current status: ${bed.status})` }, { status: 400 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { patientId, admissionId, expectedUseAt, expiresAt, reason, notes } = body;
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

  const reservation = await db.bedReservation.create({
    data: {
      bedId: id,
      admissionId: admissionId || null,
      patientId,
      facilityId: bed.facilityId,
      wardId: bed.wardId,
      roomId: bed.roomId,
      expectedUseAt: expectedUseAt ? new Date(expectedUseAt) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      reservedById: session.user.id,
      reason: reason || null,
      notes: notes || null,
      status: "active",
    },
  });
  // Mark bed as reserved
  await db.bed.update({ where: { id }, data: { status: "reserved" } });
  await auditLog({
    userId: session.user.id, organizationId: session.user.organizationId, facilityId: bed.facilityId,
    action: "BED_RESERVED", resourceType: "bed", resourceId: id,
    newValues: { reservationId: reservation.id, patientId, reason },
  });
  return NextResponse.json({ item: reservation }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.BED_MANAGE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const url = new URL(req.url);
  const reservationId = url.searchParams.get("reservationId");
  if (!reservationId) return NextResponse.json({ error: "reservationId is required" }, { status: 400 });

  await db.bedReservation.update({
    where: { id: reservationId, bedId: id },
    data: { status: "cancelled" },
  });
  // Set bed back to available if no other active reservations
  const activeCount = await db.bedReservation.count({ where: { bedId: id, status: "active" } });
  if (activeCount === 0) {
    await db.bed.update({ where: { id }, data: { status: "available" } });
  }
  await auditLog({
    userId: session.user.id, organizationId: session.user.organizationId,
    action: "BED_RESERVATION_CANCELLED", resourceType: "bed", resourceId: id,
    newValues: { reservationId },
  });
  return NextResponse.json({ ok: true });
}
