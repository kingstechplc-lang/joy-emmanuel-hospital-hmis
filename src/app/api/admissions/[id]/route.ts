// =====================================================================
// API: /api/admissions/[id]
//   GET   — full admission with bed assignments, encounter, discharges
//   PATCH — discharge action (release bed, close encounter, set status)
//           OR generic status update
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const admission = await db.admission.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true, bloodGroup: true } },
      facility: { select: { id: true, name: true, code: true } },
      encounter: { select: { id: true, encounterNumber: true, encounterType: true, status: true } },
      admittedBy: { select: { id: true, firstName: true, lastName: true } },
      bedAssignments: {
        orderBy: { assignedAt: "desc" },
        include: { bed: true, ward: { select: { id: true, name: true, code: true } }, room: { select: { id: true, roomNumber: true } } },
      },
      discharges: { orderBy: { dischargedAt: "desc" } },
      nursingNotes: { orderBy: { createdAt: "desc" }, take: 5, include: { nurse: { select: { id: true, firstName: true, lastName: true } } } },
      carePlans: { orderBy: { createdAt: "desc" }, take: 5 },
      transfers: { orderBy: { requestedAt: "desc" }, take: 5 },
    },
  });

  if (!admission) return NextResponse.json({ error: "Admission not found" }, { status: 404 });
  return NextResponse.json({ item: admission });
}

// PATCH /api/admissions/[id]
// body: { action?: "discharge" | "cancel" | "update", status?, admissionReason?, admissionDiagnosis?, admittedById? }
//       When action=discharge, also pass dischargeSummary/finalDiagnosis/procedures/medications/followUpPlan/disposition
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action } = body;

  const existing = await db.admission.findUnique({
    where: { id },
    include: { bedAssignments: { where: { status: "active" } } },
  });
  if (!existing) return NextResponse.json({ error: "Admission not found" }, { status: 404 });

  // ---- DISCHARGE action (gated by admission.discharge) ----
  if (action === "discharge") {
    if (!hasPermission(session, PERMISSIONS.ADMISSION_DISCHARGE)) {
      return NextResponse.json({ error: "Missing admission.discharge permission" }, { status: 403 });
    }
    if (existing.status !== "admitted") {
      return NextResponse.json({ error: `Cannot discharge an admission with status: ${existing.status}` }, { status: 400 });
    }
    const {
      dischargeSummary, finalDiagnosis, procedures, medications, followUpPlan, disposition,
    } = body;

    try {
      const result = await db.$transaction(async (tx) => {
        // 1. Mark admission discharged
        const updated = await tx.admission.update({
          where: { id },
          data: { status: "discharged", dischargedAt: new Date() },
        });

        // 2. Release active bed assignments + mark beds available
        for (const ba of existing.bedAssignments) {
          await tx.bedAssignment.update({
            where: { id: ba.id },
            data: { status: "released", releasedAt: new Date() },
          });
          // Only flip to available if no other active assignment exists on that bed
          const stillAssigned = await tx.bedAssignment.count({
            where: { bedId: ba.bedId, status: "active" },
          });
          if (stillAssigned === 0) {
            await tx.bed.update({
              where: { id: ba.bedId },
              data: { status: "available" },
            });
          }
        }

        // 3. Close encounter
        if (existing.encounterId) {
          await tx.encounter.update({
            where: { id: existing.encounterId },
            data: { status: "discharged", endAt: new Date() },
          }).catch(() => {});
        }

        // 4. Create discharge record
        const discharge = await tx.dischargeRecord.create({
          data: {
            patientId: existing.patientId,
            admissionId: id,
            dischargeSummary: dischargeSummary || null,
            finalDiagnosis: finalDiagnosis || null,
            procedures: procedures || null,
            medications: medications || null,
            followUpPlan: followUpPlan || null,
            disposition: disposition || "home",
            dischargedById: session.user.id,
            dischargedAt: new Date(),
          },
        });

        return { updated, discharge };
      });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId,
        action: "PATIENT_DISCHARGED",
        resourceType: "admission",
        resourceId: id,
        oldValues: { status: existing.status },
        newValues: {
          status: "discharged",
          dischargedAt: new Date(),
          disposition: disposition || "home",
          dischargeId: result.discharge.id,
        },
      });

      return NextResponse.json({ item: result.updated, discharge: result.discharge });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "Discharge failed" }, { status: 400 });
    }
  }

  // ---- CANCEL action ----
  if (action === "cancel") {
    if (!hasPermission(session, PERMISSIONS.ADMISSION_CREATE)) {
      return NextResponse.json({ error: "Missing admission.create permission" }, { status: 403 });
    }
    if (existing.status === "discharged") {
      return NextResponse.json({ error: "Cannot cancel a discharged admission" }, { status: 400 });
    }
    try {
      const updated = await db.$transaction(async (tx) => {
        // Release any active bed assignments + free beds
        for (const ba of existing.bedAssignments) {
          await tx.bedAssignment.update({
            where: { id: ba.id },
            data: { status: "released", releasedAt: new Date() },
          });
          await tx.bed.update({
            where: { id: ba.bedId },
            data: { status: "available" },
          }).catch(() => {});
        }
        return await tx.admission.update({
          where: { id },
          data: { status: "cancelled", dischargedAt: new Date() },
        });
      });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: existing.facilityId,
        action: "ADMISSION_CANCELLED",
        resourceType: "admission",
        resourceId: id,
        oldValues: { status: existing.status },
        newValues: { status: "cancelled" },
      });

      return NextResponse.json({ item: updated });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "Cancel failed" }, { status: 400 });
    }
  }

  // ---- Generic UPDATE ----
  if (!hasPermission(session, PERMISSIONS.ADMISSION_CREATE)) {
    return NextResponse.json({ error: "Missing admission.create permission" }, { status: 403 });
  }
  const data: any = {};
  if (body.admissionReason !== undefined) data.admissionReason = body.admissionReason;
  if (body.admissionDiagnosis !== undefined) data.admissionDiagnosis = body.admissionDiagnosis;
  if (body.admittedById !== undefined) data.admittedById = body.admittedById;
  if (body.admissionType !== undefined) data.admissionType = body.admissionType;

  const updated = await db.admission.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "ADMISSION_UPDATED",
    resourceType: "admission",
    resourceId: id,
    oldValues: { admissionReason: existing.admissionReason, admissionDiagnosis: existing.admissionDiagnosis },
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}
