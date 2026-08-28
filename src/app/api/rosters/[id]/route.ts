// =====================================================================
// API: /api/rosters/[id]
//   GET    — fetch roster with assignments
//   PATCH  — update roster metadata
//   DELETE — delete roster (only if draft)
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
  const roster = await db.roster.findUnique({
    where: { id },
    include: {
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      shifts: {
        include: {
          staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true } },
          shiftTypeRef: true,
        },
        orderBy: [{ shiftDate: "asc" }, { startTime: "asc" }],
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 10,
        include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  if (!roster || roster.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ item: roster });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ROSTER_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.roster.findUnique({ where: { id } });
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

  const { name, departmentId, startDate, endDate, notes, status } = body;
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (departmentId !== undefined) updateData.departmentId = departmentId || null;
  if (startDate !== undefined) updateData.startDate = new Date(startDate);
  if (endDate !== undefined) updateData.endDate = new Date(endDate);
  if (notes !== undefined) updateData.notes = notes;

  // Direct status changes (review/approved/archived)
  if (status && ["draft", "review", "approved", "archived"].includes(status)) {
    if (existing.lockedAt) {
      return NextResponse.json({ error: "Roster is locked. Unlock it first." }, { status: 400 });
    }
    updateData.status = status;
  }

  const updated = await db.roster.update({ where: { id }, data: updateData });

  // Snapshot for version history
  if (Object.keys(updateData).length > 0) {
    const newVersion = existing.versionNumber + 1;
    const shifts = await db.staffShift.findMany({
      where: { rosterId: id },
      select: { id: true, staffId: true, shiftDate: true, startTime: true, endTime: true, shiftType: true, status: true },
    });
    await db.rosterVersion.create({
      data: {
        rosterId: id,
        versionNumber: newVersion,
        snapshot: JSON.stringify({ assignments: shifts }),
        changedById: session.user.id,
        changeReason: body.changeReason || "Updated",
      },
    });
    await db.roster.update({ where: { id }, data: { versionNumber: newVersion } });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "ROSTER_UPDATED",
    resourceType: "roster",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ROSTER_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.roster.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.status === "published") {
    return NextResponse.json({ error: "Cannot delete a published roster. Archive instead." }, { status: 400 });
  }
  if (existing.lockedAt) {
    return NextResponse.json({ error: "Cannot delete a locked roster. Unlock first." }, { status: 400 });
  }

  // Use transaction — detach shifts and delete roster
  await db.$transaction(async (tx) => {
    // Detach shifts from roster (preserve the shift records)
    await tx.staffShift.updateMany({ where: { rosterId: id }, data: { rosterId: null } });
    // Delete versions
    await tx.rosterVersion.deleteMany({ where: { rosterId: id } });
    // Delete roster
    await tx.roster.delete({ where: { id } });
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "ROSTER_DELETED",
    resourceType: "roster",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}
