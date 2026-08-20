// =====================================================================
// API: /api/admissions
//   GET  — list admissions (filter by facility, status, patient)
//   POST — create admission + auto-create inpatient encounter (if none given)
//          + atomically assign bed (set bed.status='occupied', create BedAssignment)
//          All inside db.$transaction; if bed assignment fails, rollback.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextAdmissionNumber, nextEncounterNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { notifyAdmissionCreated } from "@/lib/workflow-notifications";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/admissions?facilityId=...&status=...&patientId=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (patientId) where.patientId = patientId;

  const admissions = await db.admission.findMany({
    where,
    orderBy: { admittedAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true } },
      facility: { select: { id: true, name: true, code: true } },
      encounter: { select: { id: true, encounterNumber: true } },
      admittedBy: { select: { id: true, firstName: true, lastName: true } },
      bedAssignments: {
        where: { status: "active" },
        take: 1,
        include: {
          bed: { select: { id: true, bedNumber: true, status: true, wardId: true } },
          ward: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });

  return NextResponse.json({ items: admissions, count: admissions.length });
}

// POST /api/admissions
// body: { patientId, encounterId?, facilityId, wardId, bedId, admissionType, attendingClinicianId?,
//         admissionReason, admissionDiagnosis, roomId?, autoCreateEncounter? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    patientId, encounterId, facilityId, wardId, bedId, roomId,
    admissionType, attendingClinicianId, admissionReason, admissionDiagnosis,
  } = body;

  if (!patientId || !facilityId || !wardId || !bedId) {
    return NextResponse.json({ error: "patientId, facilityId, wardId, bedId are required" }, { status: 400 });
  }

  try {
    const admissionNumber = await nextAdmissionNumber(facilityId);

    // Run atomically: create admission + (optional encounter) + assign bed + mark bed occupied
    const result = await db.$transaction(async (tx) => {
      // 1. Verify bed is currently available (prevent double-booking)
      const bed = await tx.bed.findUnique({ where: { id: bedId } });
      if (!bed) throw new Error("Bed not found");
      if (bed.status !== "available") {
        throw new Error(`Bed ${bed.bedNumber} is not available (current status: ${bed.status})`);
      }

      // 2. Resolve encounter — auto-create if none provided
      let finalEncounterId = encounterId as string | undefined;
      if (!finalEncounterId) {
        const encounterNumber = await nextEncounterNumber(facilityId);
        const encounter = await tx.encounter.create({
          data: {
            patientId,
            facilityId,
            encounterNumber,
            encounterType: "inpatient",
            status: "admitted",
            priority: "routine",
            attendingStaffId: attendingClinicianId || null,
            startAt: new Date(),
            createdById: session.user.id,
          },
        });
        finalEncounterId = encounter.id;
      } else {
        // Transition existing encounter to "admitted"
        await tx.encounter.update({
          where: { id: finalEncounterId },
          data: { status: "admitted" },
        }).catch(() => {
          // tolerate if encounter doesn't exist
        });
      }

      // 3. Create admission
      const admission = await tx.admission.create({
        data: {
          patientId,
          encounterId: finalEncounterId,
          facilityId,
          admissionNumber,
          admissionType: admissionType || "elective",
          admittedById: attendingClinicianId || session.user.id,
          admissionReason: admissionReason || null,
          admissionDiagnosis: admissionDiagnosis || null,
          admittedAt: new Date(),
          status: "admitted",
        },
      });

      // 4. Mark bed occupied
      await tx.bed.update({
        where: { id: bedId },
        data: { status: "occupied" },
      });

      // 5. Create active BedAssignment
      const assignment = await tx.bedAssignment.create({
        data: {
          admissionId: admission.id,
          patientId,
          facilityId,
          wardId,
          roomId: roomId || bed.roomId || null,
          bedId,
          assignedAt: new Date(),
          assignedById: session.user.id,
          status: "active",
        },
      });

      return { admission, assignment, encounterId: finalEncounterId };
    });

    // Audit logs (outside transaction — they're best-effort)
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId,
      action: "ADMISSION_CREATED",
      resourceType: "admission",
      resourceId: result.admission.id,
      newValues: {
        admissionNumber,
        patientId,
        encounterId: result.encounterId,
        admissionType: admissionType || "elective",
        admissionDiagnosis,
      },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId,
      action: "BED_ASSIGNED",
      resourceType: "bed_assignment",
      resourceId: result.assignment.id,
      newValues: { bedId, admissionId: result.admission.id, patientId, wardId },
    });

    const fullAdmission = await db.admission.findUnique({
      where: { id: result.admission.id },
      include: {
        patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
        facility: { select: { id: true, name: true } },
        encounter: { select: { id: true, encounterNumber: true } },
        bedAssignments: { where: { status: "active" }, include: { bed: true, ward: true } },
      },
    });

    // 🔔 Fire workflow notification to ward/nursing staff
    if (fullAdmission) {
      const activeBed = fullAdmission.bedAssignments[0];
      await notifyAdmissionCreated({
        organizationId: session.user.organizationId,
        facilityId,
        admissionNumber: fullAdmission.admissionNumber,
        patientName: `${fullAdmission.patient.firstName} ${fullAdmission.patient.lastName}`,
        wardName: activeBed?.ward?.name || "Ward",
        bedNumber: activeBed?.bed?.bedNumber,
        admissionId: fullAdmission.id,
        admittingDoctorId: fullAdmission.admittedById || undefined,
      });
    }

    return NextResponse.json({ item: fullAdmission }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create admission" }, { status: 400 });
  }
}
