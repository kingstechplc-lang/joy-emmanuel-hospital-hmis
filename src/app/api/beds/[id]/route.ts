// =====================================================================
// API: /api/beds/[id]
//   GET    — single bed with current assignment
//   PATCH  — update bed (supports both status transitions AND master field edits)
//           If body has { status } → status transition (transactional)
//           If body has { action: "edit" } → master field edit
//   DELETE — retire bed (lifecycleStatus = "retired", status = "out_of_service")
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_STATUSES = ["available", "occupied", "reserved", "cleaning", "maintenance", "out_of_service", "blocked", "isolation", "temporarily_unavailable"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW) && !hasPermission(session, PERMISSIONS.BED_VIEW) && !hasPermission(session, PERMISSIONS.BED_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const bed = await db.bed.findUnique({
    where: { id },
    include: {
      ward: { select: { id: true, name: true, code: true, wardType: true } },
      room: { select: { id: true, roomNumber: true, roomType: true } },
      bedAssignments: {
        where: { status: "active" },
        take: 1,
        include: {
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true, bloodGroup: true } },
          admission: {
            select: {
              id: true, admissionNumber: true, admissionType: true, admissionDiagnosis: true,
              admittedAt: true, status: true,
              admittedBy: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  if (!bed) return NextResponse.json({ error: "Bed not found" }, { status: 404 });
  return NextResponse.json({ item: bed });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  // ---- EDIT MODE: update master fields ----
  if (body.action === "edit") {
    if (!hasPermission(session, PERMISSIONS.BED_EDIT) && !hasPermission(session, PERMISSIONS.BED_MANAGE)) {
      return NextResponse.json({ error: "Forbidden — missing bed.edit permission" }, { status: 403 });
    }
    const existing = await db.bed.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Bed not found" }, { status: 404 });

    const allowedFields = [
      "bedNumber", "bedCode", "bedType", "building", "floor",
      "genderRestriction", "ageRestriction", "description", "notes",
    ];
    const updateData: any = { updatedById: session.user.id };
    for (const f of allowedFields) {
      if (body[f] !== undefined) updateData[f] = body[f] || null;
    }
    // Boolean fields
    const boolFields = ["isolationCapable", "oxygen", "ventilator", "cardiacMonitoring", "icuMonitoring", "suction", "accessibility"];
    for (const f of boolFields) {
      if (body[f] !== undefined) updateData[f] = !!body[f];
    }
    // Ward/room reassignment
    if (body.wardId !== undefined) updateData.wardId = body.wardId;
    if (body.roomId !== undefined) updateData.roomId = body.roomId || null;
    // Lifecycle status
    if (body.lifecycleStatus !== undefined) updateData.lifecycleStatus = body.lifecycleStatus;

    // Check bed number uniqueness if changing
    if (updateData.bedNumber && updateData.bedNumber !== existing.bedNumber) {
      const dup = await db.bed.findUnique({
        where: { wardId_bedNumber: { wardId: updateData.wardId || existing.wardId, bedNumber: updateData.bedNumber } },
      });
      if (dup && dup.id !== id) {
        return NextResponse.json({ error: "Bed with this number already exists in this ward" }, { status: 409 });
      }
    }

    const updated = await db.bed.update({ where: { id }, data: updateData });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId,
      action: "BED_EDITED", resourceType: "bed", resourceId: id,
      oldValues: { bedNumber: existing.bedNumber, bedType: existing.bedType, wardId: existing.wardId },
      newValues: updateData,
    });
    return NextResponse.json({ item: updated });
  }

  // ---- STATUS TRANSITION MODE (existing behavior) ----
  if (!hasPermission(session, PERMISSIONS.BED_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { status, notes } = body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  try {
    // Use a transaction to atomically check + update (prevents race conditions / double-booking)
    const updated = await db.$transaction(async (tx) => {
      const current = await tx.bed.findUnique({ where: { id } });
      if (!current) throw new Error("Bed not found");

      // Disallow releasing an occupied bed via this endpoint — use /release instead
      if (current.status === "occupied" && status === "available") {
        throw new Error("Cannot directly mark an occupied bed as available. Use the /release endpoint to release the active assignment.");
      }
      // Disallow marking an available bed as occupied directly — use /assign
      if (current.status === "available" && status === "occupied") {
        throw new Error("Cannot directly mark an available bed as occupied. Use the /assign endpoint to assign a patient.");
      }

      return await tx.bed.update({
        where: { id },
        data: { status, ...(notes !== undefined ? { notes } : {}) },
      });
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: updated.facilityId,
      action: "BED_STATUS_CHANGED",
      resourceType: "bed",
      resourceId: id,
      newValues: { status, notes },
    });

    return NextResponse.json({ item: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to update bed" }, { status: 400 });
  }
}

// DELETE — retire a bed (soft-delete: lifecycleStatus = "retired", status = "out_of_service")
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BED_RETIRE) && !hasPermission(session, PERMISSIONS.BED_MANAGE)) {
    return NextResponse.json({ error: "Forbidden — missing bed.retire permission" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.bed.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Bed not found" }, { status: 404 });

  // Check for active assignment
  const activeAssignment = await db.bedAssignment.count({
    where: { bedId: id, status: "active" },
  });
  if (activeAssignment > 0) {
    return NextResponse.json({ error: "Cannot retire a bed with an active patient assignment. Release the patient first." }, { status: 400 });
  }

  // Soft-delete: retire the bed
  await db.bed.update({
    where: { id },
    data: {
      lifecycleStatus: "retired",
      status: "out_of_service",
      updatedById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId,
    action: "BED_RETIRED", resourceType: "bed", resourceId: id,
    oldValues: { bedNumber: existing.bedNumber, status: existing.status, lifecycleStatus: existing.lifecycleStatus },
  });

  return NextResponse.json({ ok: true });
}
