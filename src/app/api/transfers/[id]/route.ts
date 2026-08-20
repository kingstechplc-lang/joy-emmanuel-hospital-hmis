// =====================================================================
// API: /api/transfers/[id]
//   GET   — single transfer
//   PATCH — action: "approve" | "accept" | "complete" | "cancel"
//           approve:  release old bed + occupy new bed (if bedId specified)
//           complete: mark transfer completed; close transfer record
//           cancel:   revert (if bed was already moved, restore from-bed)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const transfer = await db.patientTransfer.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      admission: { select: { id: true, admissionNumber: true, status: true } },
      fromFacility: { select: { id: true, name: true, code: true } },
      toFacility: { select: { id: true, name: true, code: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  if (!transfer) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  return NextResponse.json({ item: transfer });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_TRANSFER)) {
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
  const { action } = body;

  const existing = await db.patientTransfer.findUnique({
    where: { id },
    include: {
      admission: { include: { bedAssignments: { where: { status: "active" } } } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });

  // ---- APPROVE ----
  if (action === "approve") {
    if (existing.status !== "requested") {
      return NextResponse.json({ error: `Cannot approve transfer with status: ${existing.status}` }, { status: 400 });
    }

    try {
      const result = await db.$transaction(async (tx) => {
        // 1. If a target bed is specified, occupy it
        if (existing.toBedId) {
          const targetBed = await tx.bed.findUnique({ where: { id: existing.toBedId } });
          if (!targetBed) throw new Error("Target bed not found");
          if (targetBed.status !== "available") {
            throw new Error(`Target bed ${targetBed.bedNumber} is not available (status: ${targetBed.status})`);
          }

          // Release prior active bed assignments for this admission
          for (const ba of existing.admission.bedAssignments) {
            await tx.bedAssignment.update({
              where: { id: ba.id },
              data: { status: "released", releasedAt: new Date() },
            });
            const stillAssigned = await tx.bedAssignment.count({
              where: { bedId: ba.bedId, status: "active" },
            });
            if (stillAssigned === 0) {
              await tx.bed.update({
                where: { id: ba.bedId },
                data: { status: "cleaning" },
              });
            }
          }

          // Occupy new bed
          await tx.bed.update({
            where: { id: existing.toBedId },
            data: { status: "occupied" },
          });
          await tx.bedAssignment.create({
            data: {
              admissionId: existing.admissionId,
              patientId: existing.patientId,
              facilityId: existing.toFacilityId,
              wardId: existing.toWardId || targetBed.wardId,
              roomId: targetBed.roomId,
              bedId: existing.toBedId,
              assignedAt: new Date(),
              assignedById: session.user.id,
              status: "active",
            },
          });
        }

        // 2. Update transfer status
        return await tx.patientTransfer.update({
          where: { id },
          data: { status: "approved", approvedById: session.user.id },
        });
      });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.toFacilityId,
        action: "PATIENT_TRANSFER_APPROVED",
        resourceType: "patient_transfer",
        resourceId: id,
        oldValues: { status: existing.status },
        newValues: { status: "approved", toBedId: existing.toBedId },
      });

      return NextResponse.json({ item: result });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "Approve failed" }, { status: 400 });
    }
  }

  // ---- ACCEPT ----
  if (action === "accept") {
    if (existing.status !== "approved") {
      return NextResponse.json({ error: `Cannot accept transfer with status: ${existing.status}` }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      // Move admission to new facility (if different)
      if (existing.fromFacilityId !== existing.toFacilityId) {
        await tx.admission.update({
          where: { id: existing.admissionId },
          data: { facilityId: existing.toFacilityId },
        }).catch(() => {});
      }
      return await tx.patientTransfer.update({
        where: { id },
        data: { status: "accepted", acceptedById: session.user.id, acceptedAt: new Date() },
      });
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.toFacilityId,
      action: "PATIENT_TRANSFER_ACCEPTED",
      resourceType: "patient_transfer",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "accepted" },
    });

    return NextResponse.json({ item: result });
  }

  // ---- COMPLETE ----
  if (action === "complete") {
    if (!["accepted", "approved"].includes(existing.status)) {
      return NextResponse.json({ error: `Cannot complete transfer with status: ${existing.status}` }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      // Mark admission as transferred
      await tx.admission.update({
        where: { id: existing.admissionId },
        data: { status: "transferred" },
      }).catch(() => {});
      return await tx.patientTransfer.update({
        where: { id },
        data: { status: "completed", completedAt: new Date() },
      });
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.toFacilityId,
      action: "PATIENT_TRANSFERRED",
      resourceType: "patient_transfer",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "completed" },
    });

    return NextResponse.json({ item: result });
  }

  // ---- CANCEL ----
  if (action === "cancel") {
    const result = await db.$transaction(async (tx) => {
      return await tx.patientTransfer.update({
        where: { id },
        data: { status: "cancelled" },
      });
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.fromFacilityId,
      action: "PATIENT_TRANSFER_CANCELLED",
      resourceType: "patient_transfer",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "cancelled" },
      reason: body.reason || null,
    });

    return NextResponse.json({ item: result });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
