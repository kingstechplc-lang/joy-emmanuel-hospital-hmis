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
// body: { patientId, encounterId?, facilityId, wardId?, bedId?, admissionType, attendingClinicianId?,
//         admissionReason, admissionDiagnosis, roomId?, autoCreateEncounter?,
//         provisionalDiagnosis?, clinicalIndication?, priority?, departmentId?,
//         requestedWardId?, requestedBedType?, specialRequirements?, admissionSource?,
//         notes?, status? }
// If bedId is provided → immediate admission (status="admitted")
// If bedId is NOT provided → admission request (status="requested")
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_CREATE) && !hasPermission(session, PERMISSIONS.ADMISSION_REQUEST)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const {
    patientId, encounterId, facilityId, wardId, bedId, roomId,
    admissionType, attendingClinicianId, admissionReason, admissionDiagnosis,
    provisionalDiagnosis, clinicalIndication, priority, departmentId,
    requestedWardId, requestedBedType, specialRequirements, admissionSource,
    notes, status: explicitStatus,
  } = body;

  if (!patientId || !facilityId) {
    return NextResponse.json({ error: "patientId and facilityId are required" }, { status: 400 });
  }

  // Determine if this is a request (no bed) or immediate admission (with bed)
  const isRequest = !bedId;
  const requestedStatus = explicitStatus || (isRequest ? "requested" : "admitted");

  // For immediate admission, wardId and bedId are required
  if (!isRequest && (!wardId || !bedId)) {
    return NextResponse.json({ error: "wardId and bedId are required for immediate admission" }, { status: 400 });
  }

  try {
    const admissionNumber = await nextAdmissionNumber(facilityId);

    // Run atomically: create admission + (optional encounter) + assign bed (if immediate) + mark bed occupied
    const result = await db.$transaction(async (tx) => {
      // 1. For immediate admission, verify bed is available
      let bed: any = null;
      if (!isRequest) {
        bed = await tx.bed.findUnique({ where: { id: bedId } });
        if (!bed) throw new Error("Bed not found");
        if (bed.status !== "available") {
          throw new Error(`Bed ${bed.bedNumber} is not available (current status: ${bed.status})`);
        }
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
            status: isRequest ? "in_progress" : "admitted",
            priority: priority || "routine",
            attendingStaffId: attendingClinicianId || null,
            startAt: new Date(),
            createdById: session.user.id,
          },
        });
        finalEncounterId = encounter.id;
      } else if (!isRequest) {
        // Transition existing encounter to "admitted" only for immediate admission
        await tx.encounter.update({
          where: { id: finalEncounterId },
          data: { status: "admitted" },
        }).catch(() => {
          // tolerate if encounter doesn't exist
        });
      }

      // 3. Create admission (request or immediate)
      const admission = await tx.admission.create({
        data: {
          patientId,
          encounterId: finalEncounterId,
          facilityId,
          admissionNumber,
          admissionType: admissionType || "elective",
          admittedById: isRequest ? null : (attendingClinicianId || session.user.id),
          admittedAt: isRequest ? new Date() : new Date(), // requestedAt set below for requests
          admissionReason: admissionReason || null,
          admissionDiagnosis: admissionDiagnosis || null,
          provisionalDiagnosis: provisionalDiagnosis || null,
          clinicalIndication: clinicalIndication || null,
          priority: priority || "routine",
          departmentId: departmentId || null,
          requestedWardId: requestedWardId || wardId || null,
          requestedBedType: requestedBedType || null,
          specialRequirements: specialRequirements || null,
          admissionSource: admissionSource || null,
          attendingClinicianId: attendingClinicianId || null,
          requestedById: isRequest ? session.user.id : null,
          requestedAt: isRequest ? new Date() : null,
          notes: notes || null,
          createdById: session.user.id,
          updatedById: session.user.id,
          status: requestedStatus,
        },
      });

      // 4-5. For immediate admission only: mark bed occupied + create BedAssignment
      let assignment: any = null;
      if (!isRequest && bed) {
        await tx.bed.update({
          where: { id: bedId },
          data: { status: "occupied" },
        });
        assignment = await tx.bedAssignment.create({
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
      }

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
