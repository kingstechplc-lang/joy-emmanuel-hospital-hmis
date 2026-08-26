// =====================================================================
// API: /api/ward-rounds/[id]
//   GET    — single ward round with full relations
//   PATCH  — update round fields OR lifecycle: start/complete/cancel/reschedule
//   DELETE — cancel round (soft)
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
  if (!session.user.permissions?.includes(PERMISSIONS.WARD_ROUND_VIEW) && !session.user.permissions?.includes(PERMISSIONS.ADMISSION_VIEW) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const round = await db.wardRound.findUnique({
    where: { id },
    include: {
      ward: { select: { id: true, name: true, code: true } },
      facility: { select: { id: true, name: true } },
      consultant: { select: { id: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      roundPatients: {
        include: {
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true, bloodGroup: true } },
        },
        orderBy: { reviewPriority: "asc" },
      },
      roundNotes: {
        include: { patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } } },
        orderBy: { authoredAt: "desc" },
      },
      roundActions: {
        include: { patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } } },
        orderBy: { createdAt: "desc" },
      },
      roundParticipants: { orderBy: { role: "asc" } },
    },
  });
  if (!round) return NextResponse.json({ error: "Ward round not found" }, { status: 404 });
  return NextResponse.json({ item: round });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { action } = body;

  const existing = await db.wardRound.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Ward round not found" }, { status: 404 });

  // ---- LIFECYCLE ACTIONS ----
  if (action === "start") {
    if (!session.user.permissions?.includes(PERMISSIONS.WARD_ROUND_START) && !session.user.roles.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden — missing ward_round.start permission" }, { status: 403 });
    }
    if (existing.status !== "scheduled") return NextResponse.json({ error: `Cannot start round in status "${existing.status}"` }, { status: 400 });
    const updated = await db.wardRound.update({ where: { id }, data: { status: "in_progress", startTime: new Date() } });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId, action: "WARD_ROUND_STARTED", resourceType: "ward_round", resourceId: id });
    return NextResponse.json({ item: updated });
  }

  if (action === "complete") {
    if (!session.user.permissions?.includes(PERMISSIONS.WARD_ROUND_COMPLETE) && !session.user.roles.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden — missing ward_round.complete permission" }, { status: 403 });
    }
    if (existing.status !== "in_progress") return NextResponse.json({ error: `Cannot complete round in status "${existing.status}"` }, { status: 400 });
    const updated = await db.wardRound.update({ where: { id }, data: { status: "completed", completedAt: new Date(), completedById: session.user.id, endTime: new Date() } });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId, action: "WARD_ROUND_COMPLETED", resourceType: "ward_round", resourceId: id });
    return NextResponse.json({ item: updated });
  }

  if (action === "cancel") {
    if (!session.user.permissions?.includes(PERMISSIONS.WARD_ROUND_CREATE) && !session.user.roles.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await db.wardRound.update({ where: { id }, data: { status: "cancelled", cancelledAt: new Date(), cancelledById: session.user.id, cancellationReason: body.reason || null } });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId, action: "WARD_ROUND_CANCELLED", resourceType: "ward_round", resourceId: id, newValues: { reason: body.reason } });
    return NextResponse.json({ item: updated });
  }

  // ---- GENERIC UPDATE ----
  if (!session.user.permissions?.includes(PERMISSIONS.WARD_ROUND_CREATE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const updateData: any = {};
  const fields = ["roundType", "status", "priority", "wardId", "consultantId", "leadClinicianId", "notes", "planChanges", "roundDate", "expectedEndTime"];
  for (const f of fields) {
    if (body[f] !== undefined) updateData[f] = body[f] || null;
  }
  const updated = await db.wardRound.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId, action: "WARD_ROUND_UPDATED", resourceType: "ward_round", resourceId: id, newValues: updateData });
  return NextResponse.json({ item: updated });
}
