// =====================================================================
// API: /api/discharges
//   GET  — list discharge records (filter by facility via admission.facilityId, patient, date)
//   POST — create discharge record + release bed + close encounter + mark admission discharged
//          All transactional.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

// GET /api/discharges?facilityId=...&patientId=...&admissionId=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const patientId = url.searchParams.get("patientId");
  const admissionId = url.searchParams.get("admissionId");
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (admissionId) where.admissionId = admissionId;
  if (facilityId) where.admission = { facilityId };

  const discharges = await db.dischargeRecord.findMany({
    where,
    orderBy: { dischargedAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true } },
      admission: {
        select: {
          id: true, admissionNumber: true, admissionType: true, admissionDiagnosis: true,
          admittedAt: true, status: true,
          facility: { select: { id: true, name: true, code: true } },
        },
      },
      dischargedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: discharges, count: discharges.length });
}

// POST /api/discharges
// body: { admissionId, dischargeSummary, finalDiagnosis, procedures, medications, followUpPlan, disposition }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_DISCHARGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { admissionId, dischargeSummary, finalDiagnosis, procedures, medications, followUpPlan, disposition } = body;

  if (!admissionId) {
    return NextResponse.json({ error: "admissionId is required" }, { status: 400 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Find admission + active bed assignments
      const admission = await tx.admission.findUnique({
        where: { id: admissionId },
        include: { bedAssignments: { where: { status: "active" } } },
      });
      if (!admission) throw new Error("Admission not found");
      if (admission.status !== "admitted") {
        throw new Error(`Admission status is ${admission.status}; only admitted patients can be discharged`);
      }

      // 2. Mark admission discharged
      await tx.admission.update({
        where: { id: admissionId },
        data: { status: "discharged", dischargedAt: new Date() },
      });

      // 3. Release active beds + mark available
      for (const ba of admission.bedAssignments) {
        await tx.bedAssignment.update({
          where: { id: ba.id },
          data: { status: "released", releasedAt: new Date() },
        });
        // Free the bed if no other active assignment remains
        const stillAssigned = await tx.bedAssignment.count({
          where: { bedId: ba.bedId, status: "active" },
        });
        if (stillAssigned === 0) {
          await tx.bed.update({
            where: { id: ba.bedId },
            data: { status: "cleaning" }, // beds require cleaning after discharge
          });
        }
      }

      // 4. Close encounter
      if (admission.encounterId) {
        await tx.encounter.update({
          where: { id: admission.encounterId },
          data: { status: "discharged", endAt: new Date() },
        }).catch(() => {});
      }

      // 5. Create discharge record
      const discharge = await tx.dischargeRecord.create({
        data: {
          patientId: admission.patientId,
          admissionId,
          dischargeSummary: dischargeSummary || null,
          finalDiagnosis: finalDiagnosis || null,
          procedures: procedures || null,
          medications: medications || null,
          followUpPlan: followUpPlan || null,
          disposition: disposition || "home",
          dischargedById: session.user.id,
          dischargedAt: new Date(),
        },
        include: {
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
          admission: { select: { id: true, admissionNumber: true, facilityId: true } },
        },
      });

      return discharge;
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: result.admission.facilityId,
      action: "PATIENT_DISCHARGED",
      resourceType: "discharge_record",
      resourceId: result.id,
      newValues: {
        admissionId,
        disposition: disposition || "home",
        finalDiagnosis,
      },
    });

    return NextResponse.json({ item: result }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to discharge patient" }, { status: 400 });
  }
}
