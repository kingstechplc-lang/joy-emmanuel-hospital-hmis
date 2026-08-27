// =====================================================================
// API: /api/discharges
//   GET    — list discharge records (filter by facility/patient/admission/status/type/date)
//   POST   — REQUEST a discharge (creates DischargeRecord in 'requested' status;
//            admission remains active until finalize)
//   PATCH  — lifecycle: approve | finalize | cancel | delay | amend | update
//            (finalized discharge performs the full transactional closure:
//            mark admission discharged → release beds → close encounter →
//            assign discharge number)
//
// SAFETY:
//   - Request ≠ Discharge: a discharge request does NOT close the admission
//   - Finalize performs the actual admission closure in a transaction
//   - All amendments preserve original values in audit log
//   - Patient remains in Master Patient Index after discharge
//   - Bed is set to 'cleaning' (not 'available') to respect turnover workflow
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { notifyDischargeInitiated } from "@/lib/workflow-notifications";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_STATUSES = ["requested", "clinical_review", "approved", "pending_clearance", "pending_billing", "pending_medication", "pending_documentation", "ready", "discharged", "cancelled", "delayed"];
const VALID_DISCHARGE_TYPES = ["routine", "transfer_to_facility", "transfer_to_ward", "ama", "absconded", "deceased", "other"];
const VALID_DISPOSITIONS = ["home", "transferred", "referred", "deceased", "ama", "absconded", "other"];

// Default checklist items created when a discharge is requested
const DEFAULT_CHECKLIST: { category: string; label: string; required: boolean; sortOrder: number }[] = [
  { category: "clinical", label: "Discharge order reviewed", required: true, sortOrder: 1 },
  { category: "clinical", label: "Final diagnosis documented", required: true, sortOrder: 2 },
  { category: "clinical", label: "Discharge summary completed", required: true, sortOrder: 3 },
  { category: "clinical", label: "Vitals documented", required: false, sortOrder: 4 },
  { category: "nursing", label: "Patient identity confirmed", required: true, sortOrder: 1 },
  { category: "nursing", label: "IV access removed (if applicable)", required: false, sortOrder: 2 },
  { category: "nursing", label: "Catheter status addressed", required: false, sortOrder: 3 },
  { category: "nursing", label: "Patient belongings returned", required: true, sortOrder: 4 },
  { category: "nursing", label: "Wound care instructions provided", required: false, sortOrder: 5 },
  { category: "pharmacy", label: "Discharge medications prescribed", required: true, sortOrder: 1 },
  { category: "pharmacy", label: "Medications dispensed", required: false, sortOrder: 2 },
  { category: "pharmacy", label: "Medication reconciliation completed", required: true, sortOrder: 3 },
  { category: "financial", label: "Billing clearance completed", required: false, sortOrder: 1 },
  { category: "financial", label: "Outstanding balance reviewed", required: false, sortOrder: 2 },
  { category: "financial", label: "Insurance/NHIS claim status verified", required: false, sortOrder: 3 },
  { category: "records", label: "Discharge documentation completed", required: true, sortOrder: 1 },
  { category: "records", label: "Discharge summary signed", required: false, sortOrder: 2 },
  { category: "follow_up", label: "Follow-up appointment scheduled", required: false, sortOrder: 1 },
  { category: "follow_up", label: "Follow-up instructions provided", required: true, sortOrder: 2 },
  { category: "transport", label: "Transport arranged (if required)", required: false, sortOrder: 1 },
  { category: "patient_education", label: "Patient education completed", required: true, sortOrder: 1 },
  { category: "patient_education", label: "Written instructions supplied", required: true, sortOrder: 2 },
];

// GET /api/discharges?facilityId=...&patientId=...&admissionId=...&status=...&dischargeType=...&from=...&to=...
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
  const status = url.searchParams.get("status");
  const dischargeType = url.searchParams.get("dischargeType");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = parseInt(url.searchParams.get("limit") || "200");
  const includeChecklist = url.searchParams.get("includeChecklist") === "true";

  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (admissionId) where.admissionId = admissionId;
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (dischargeType) where.dischargeType = dischargeType;
  if (from || to) {
    const range: any = {};
    if (from) range.gte = new Date(`${from}T00:00:00`);
    if (to) range.lte = new Date(`${to}T23:59:59.999`);
    where.dischargedAt = range;
  }

  const discharges = await db.dischargeRecord.findMany({
    where,
    orderBy: { dischargedAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true } },
      admission: {
        select: {
          id: true, admissionNumber: true, admissionType: true, admissionDiagnosis: true,
          admittedAt: true, status: true, attendingClinicianId: true,
          facility: { select: { id: true, name: true, code: true } },
          bedAssignments: { where: { status: "active" }, include: { ward: { select: { name: true } }, bed: { select: { bedNumber: true } } }, take: 1 },
        },
      },
      dischargedBy: { select: { id: true, firstName: true, lastName: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
      cancelledBy: { select: { id: true, firstName: true, lastName: true } },
      finalizedBy: { select: { id: true, firstName: true, lastName: true } },
      ...(includeChecklist ? { checklist: { orderBy: { sortOrder: "asc" } }, medicationsReconciliation: true } : {}),
    },
  });

  return NextResponse.json({ items: discharges, count: discharges.length });
}

// POST — request a new discharge (does NOT close admission)
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_DISCHARGE)) {
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
    admissionId, dischargeType, disposition, proposedDischargeAt, requestReason,
    dischargeSummary, finalDiagnosis, primaryDiagnosisCode, primaryDiagnosisName,
    dischargeConditions, adviceOnDischarge, followUpPlan, followUpAppointmentDate, followUpClinic,
    // Transfer
    transferDestination, transferReceivingFacility, transferReceivingDept, transferContactPerson, transferContactPhone, transferReason, transferTransportMethod,
    // DAMA
    damaReason, damaRisksExplained, damaAdviceProvided, damaWitnessName,
    // Death
    deathDate, deathCause,
    // Absconded
    abscondedLastSeenAt, abscondedLastLocation, abscondedCircumstances, abscondedStaffNotified,
    // Instructions
    instructionsMedication, instructionsDiet, instructionsActivity, instructionsWoundCare, instructionsFollowUp, instructionsWarningSigns, instructionsEmergency, instructionsOther,
    // skipChecklist (for quick direct discharge if user opts in)
    skipChecklist,
    // immediateFinalize (preserves legacy "POST = immediate discharge" behavior)
    immediateFinalize,
  } = body;

  if (!admissionId) {
    return NextResponse.json({ error: "admissionId is required" }, { status: 400 });
  }

  // Validate admission
  const admission = await db.admission.findUnique({
    where: { id: admissionId },
    include: { bedAssignments: { where: { status: "active" }, include: { bed: true, ward: true } }, facility: true },
  });
  if (!admission) return NextResponse.json({ error: "Admission not found" }, { status: 404 });
  if (admission.status !== "admitted") {
    return NextResponse.json({ error: `Admission status is ${admission.status}; only admitted patients can be discharged` }, { status: 400 });
  }
  // Check for existing non-cancelled discharge request
  const existingDischarge = await db.dischargeRecord.findFirst({
    where: { admissionId, status: { notIn: ["cancelled"] } },
  });
  if (existingDischarge) {
    return NextResponse.json({ error: "An active discharge request already exists for this admission. Cancel it first or proceed with the existing one." }, { status: 400 });
  }

  if (dischargeType && !VALID_DISCHARGE_TYPES.includes(dischargeType)) {
    return NextResponse.json({ error: `dischargeType must be one of: ${VALID_DISCHARGE_TYPES.join(", ")}` }, { status: 400 });
  }
  if (disposition && !VALID_DISPOSITIONS.includes(disposition)) {
    return NextResponse.json({ error: `disposition must be one of: ${VALID_DISPOSITIONS.join(", ")}` }, { status: 400 });
  }

  const facilityId = admission.facilityId;

  // Determine initial status
  const initialStatus = immediateFinalize ? "discharged" : "requested";

  try {
    // If immediateFinalize, run full transactional discharge (legacy behavior)
    if (immediateFinalize) {
      const result = await db.$transaction(async (tx) => {
        // 1. Mark admission discharged
        await tx.admission.update({
          where: { id: admissionId },
          data: { status: "discharged", dischargedAt: new Date() },
        });
        // 2. Release beds + mark cleaning
        for (const ba of admission.bedAssignments) {
          await tx.bedAssignment.update({ where: { id: ba.id }, data: { status: "released", releasedAt: new Date() } });
          const stillAssigned = await tx.bedAssignment.count({ where: { bedId: ba.bedId, status: "active" } });
          if (stillAssigned === 0) {
            await tx.bed.update({ where: { id: ba.bedId }, data: { status: "cleaning" } });
          }
        }
        // 3. Close encounter
        if (admission.encounterId) {
          await tx.encounter.update({ where: { id: admission.encounterId }, data: { status: "discharged", endAt: new Date() } }).catch(() => {});
        }
        // 4. Generate discharge number
        const year = new Date().getFullYear();
        const count = await tx.dischargeRecord.count({ where: { facilityId } });
        const dischargeNumber = `DIS-${year}-${String(count + 1).padStart(6, "0")}`;
        // 5. Create discharge record
        const discharge = await tx.dischargeRecord.create({
          data: {
            patientId: admission.patientId,
            admissionId,
            facilityId,
            dischargeNumber,
            dischargeSummary, finalDiagnosis, primaryDiagnosisCode, primaryDiagnosisName,
            procedures: body.procedures, medications: body.medications, followUpPlan,
            disposition: disposition || "home",
            dischargeType: dischargeType || "routine",
            dischargeConditions, adviceOnDischarge,
            followUpAppointmentDate: followUpAppointmentDate ? new Date(followUpAppointmentDate) : null,
            followUpClinic,
            attendingClinicianId: admission.attendingClinicianId,
            admissionDate: admission.admittedAt,
            dischargedById: session.user.id,
            dischargedAt: new Date(),
            requestedById: session.user.id,
            requestedAt: new Date(),
            approvedById: session.user.id,
            approvedAt: new Date(),
            finalizedById: session.user.id,
            finalizedAt: new Date(),
            isFinalized: true,
            status: "discharged",
            // Discharge-type-specific
            transferDestination, transferReceivingFacility, transferReceivingDept, transferContactPerson, transferContactPhone, transferReason, transferTransportMethod,
            damaReason, damaRisksExplained: !!damaRisksExplained, damaAdviceProvided, damaWitnessName,
            deathDate: deathDate ? new Date(deathDate) : null, deathCause,
            abscondedLastSeenAt: abscondedLastSeenAt ? new Date(abscondedLastSeenAt) : null, abscondedLastLocation, abscondedCircumstances, abscondedStaffNotified,
            instructionsMedication, instructionsDiet, instructionsActivity, instructionsWoundCare, instructionsFollowUp, instructionsWarningSigns, instructionsEmergency, instructionsOther,
          },
        });
        return discharge;
      });

      await auditLog({
        userId: session.user.id, organizationId: session.user.organizationId, facilityId,
        action: "PATIENT_DISCHARGED", resourceType: "discharge_record", resourceId: result.id,
        newValues: { admissionId, dischargeType: dischargeType || "routine", disposition: disposition || "home", finalDiagnosis, dischargeNumber: result.dischargeNumber },
      });

      // Notify billing + records
      try {
        await notifyDischargeInitiated({
          organizationId: session.user.organizationId, facilityId,
          patientName: `${admission.patientId}`,
          admissionId, dischargeId: result.id, wardName: admission.bedAssignments?.[0]?.ward?.name,
        });
      } catch {}

      return NextResponse.json({ item: result }, { status: 201 });
    }

    // Standard flow: create discharge REQUEST (admission stays active)
    const discharge = await db.dischargeRecord.create({
      data: {
        patientId: admission.patientId,
        admissionId,
        facilityId,
        dischargeSummary, finalDiagnosis, primaryDiagnosisCode, primaryDiagnosisName,
        procedures: body.procedures, medications: body.medications, followUpPlan,
        disposition: disposition || "home",
        dischargeType: dischargeType || "routine",
        dischargeConditions, adviceOnDischarge,
        followUpAppointmentDate: followUpAppointmentDate ? new Date(followUpAppointmentDate) : null,
        followUpClinic,
        attendingClinicianId: admission.attendingClinicianId,
        admissionDate: admission.admittedAt,
        requestedById: session.user.id,
        requestedAt: new Date(),
        proposedDischargeAt: proposedDischargeAt ? new Date(proposedDischargeAt) : null,
        status: "requested",
        // Discharge-type-specific
        transferDestination, transferReceivingFacility, transferReceivingDept, transferContactPerson, transferContactPhone, transferReason, transferTransportMethod,
        damaReason, damaRisksExplained: !!damaRisksExplained, damaAdviceProvided, damaWitnessName,
        deathDate: deathDate ? new Date(deathDate) : null, deathCause,
        abscondedLastSeenAt: abscondedLastSeenAt ? new Date(abscondedLastSeenAt) : null, abscondedLastLocation, abscondedCircumstances, abscondedStaffNotified,
        instructionsMedication, instructionsDiet, instructionsActivity, instructionsWoundCare, instructionsFollowUp, instructionsWarningSigns, instructionsEmergency, instructionsOther,
      },
      include: { patient: { select: { firstName: true, lastName: true, patientNumber: true } }, admission: { select: { admissionNumber: true, facilityId: true } } },
    });

    // Create default checklist items (unless skipped)
    if (!skipChecklist) {
      await db.dischargeChecklistItem.createMany({
        data: DEFAULT_CHECKLIST.map(item => ({ ...item, dischargeId: discharge.id })),
      });
    }

    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId,
      action: "DISCHARGE_REQUESTED", resourceType: "discharge_record", resourceId: discharge.id,
      newValues: { admissionId, dischargeType: dischargeType || "routine", disposition: disposition || "home", requestReason, proposedDischargeAt },
    });

    return NextResponse.json({ item: discharge }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create discharge request" }, { status: 400 });
  }
}

// =====================================================================
// PATCH — lifecycle: approve | finalize | cancel | delay | amend | update
// body: { dischargeId, action, ... }
// =====================================================================
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { dischargeId, action } = body;
  if (!dischargeId || !action) return NextResponse.json({ error: "dischargeId and action are required" }, { status: 400 });

  const discharge = await db.dischargeRecord.findUnique({
    where: { id: dischargeId },
    include: { admission: { include: { bedAssignments: { where: { status: "active" }, include: { bed: true } }, facility: true } } },
  });
  if (!discharge) return NextResponse.json({ error: "Discharge record not found" }, { status: 404 });

  const validActions = ["approve", "finalize", "cancel", "delay", "resume", "amend", "update", "clear"];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${validActions.join(", ")}` }, { status: 400 });
  }

  const now = new Date();

  try {
    if (action === "approve") {
      if (discharge.status === "cancelled") return NextResponse.json({ error: "Cannot approve a cancelled discharge" }, { status: 400 });
      const updated = await db.dischargeRecord.update({
        where: { id: dischargeId },
        data: {
          status: "approved",
          approvedById: session.user.id,
          approvedAt: now,
        },
      });
      await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: discharge.facilityId || undefined, action: "DISCHARGE_APPROVED", resourceType: "discharge_record", resourceId: dischargeId, oldValues: { status: discharge.status }, newValues: { status: "approved" } });
      return NextResponse.json({ item: updated });
    }

    if (action === "finalize") {
      // Finalize = perform full transactional discharge
      if (discharge.isFinalized) return NextResponse.json({ error: "Discharge is already finalized" }, { status: 400 });
      if (discharge.status === "cancelled") return NextResponse.json({ error: "Cannot finalize a cancelled discharge" }, { status: 400 });

      const result = await db.$transaction(async (tx) => {
        // 1. Mark admission discharged
        await tx.admission.update({
          where: { id: discharge.admissionId },
          data: { status: "discharged", dischargedAt: now },
        });
        // 2. Release beds + mark cleaning
        for (const ba of discharge.admission.bedAssignments) {
          await tx.bedAssignment.update({ where: { id: ba.id }, data: { status: "released", releasedAt: now } });
          const stillAssigned = await tx.bedAssignment.count({ where: { bedId: ba.bedId, status: "active" } });
          if (stillAssigned === 0) {
            await tx.bed.update({ where: { id: ba.bedId }, data: { status: "cleaning" } });
          }
        }
        // 3. Close encounter
        if (discharge.admission.encounterId) {
          await tx.encounter.update({ where: { id: discharge.admission.encounterId }, data: { status: "discharged", endAt: now } }).catch(() => {});
        }
        // 4. Generate discharge number if not present
        let dischargeNumber = discharge.dischargeNumber;
        if (!dischargeNumber) {
          const year = now.getFullYear();
          const count = await tx.dischargeRecord.count({ where: { facilityId: discharge.facilityId || "" } });
          dischargeNumber = `DIS-${year}-${String(count + 1).padStart(6, "0")}`;
        }
        // 5. Update discharge record
        const updated = await tx.dischargeRecord.update({
          where: { id: dischargeId },
          data: {
            status: "discharged",
            isFinalized: true,
            finalizedAt: now,
            finalizedById: session.user.id,
            dischargedAt: now,
            dischargedById: session.user.id,
            dischargeNumber,
            // Apply any final-update fields from body
            ...(body.finalDiagnosis ? { finalDiagnosis: body.finalDiagnosis } : {}),
            ...(body.dischargeSummary ? { dischargeSummary: body.dischargeSummary } : {}),
            ...(body.dischargeConditions ? { dischargeConditions: body.dischargeConditions } : {}),
          },
        });
        return updated;
      });

      await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: discharge.facilityId || undefined, action: "DISCHARGE_FINALIZED", resourceType: "discharge_record", resourceId: dischargeId, oldValues: { status: discharge.status }, newValues: { status: "discharged", dischargeNumber: result.dischargeNumber } });

      // Notify
      try {
        await notifyDischargeInitiated({
          organizationId: session.user.organizationId, facilityId: discharge.facilityId || "",
          patientName: discharge.patientId,
          admissionId: discharge.admissionId, dischargeId: discharge.id,
          wardName: discharge.admission.bedAssignments?.[0]?.bed?.bedNumber,
        });
      } catch {}

      return NextResponse.json({ item: result });
    }

    if (action === "cancel") {
      if (discharge.isFinalized) return NextResponse.json({ error: "Cannot cancel a finalized discharge. Use the reopen workflow if available." }, { status: 400 });
      const { cancelReason } = body;
      if (!cancelReason || !cancelReason.trim()) return NextResponse.json({ error: "cancelReason is required" }, { status: 400 });
      const updated = await db.dischargeRecord.update({
        where: { id: dischargeId },
        data: {
          status: "cancelled",
          cancelledAt: now,
          cancelledById: session.user.id,
          cancelReason,
        },
      });
      await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: discharge.facilityId || undefined, action: "DISCHARGE_CANCELLED", resourceType: "discharge_record", resourceId: dischargeId, oldValues: { status: discharge.status }, newValues: { status: "cancelled", cancelReason } });
      return NextResponse.json({ item: updated });
    }

    if (action === "delay") {
      const { delayReason, delayDepartment, expectedDischargeAt } = body;
      if (!delayReason) return NextResponse.json({ error: "delayReason is required" }, { status: 400 });
      const updated = await db.dischargeRecord.update({
        where: { id: dischargeId },
        data: {
          status: "delayed",
          delayedAt: now,
          delayReason,
          delayDepartment: delayDepartment || null,
          expectedDischargeAt: expectedDischargeAt ? new Date(expectedDischargeAt) : null,
        },
      });
      await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: discharge.facilityId || undefined, action: "DISCHARGE_DELAYED", resourceType: "discharge_record", resourceId: dischargeId, oldValues: { status: discharge.status }, newValues: { status: "delayed", delayReason, delayDepartment } });
      return NextResponse.json({ item: updated });
    }

    if (action === "resume") {
      // Resume from delayed/cancelled back to approved or requested
      const targetStatus = discharge.approvedAt ? "approved" : "requested";
      const updated = await db.dischargeRecord.update({
        where: { id: dischargeId },
        data: { status: targetStatus },
      });
      await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: discharge.facilityId || undefined, action: "DISCHARGE_RESUMED", resourceType: "discharge_record", resourceId: dischargeId, oldValues: { status: discharge.status }, newValues: { status: targetStatus } });
      return NextResponse.json({ item: updated });
    }

    if (action === "amend") {
      if (!discharge.isFinalized) return NextResponse.json({ error: "Can only amend finalized discharges" }, { status: 400 });
      const { amendmentReason, ...updateFields } = body;
      if (!amendmentReason) return NextResponse.json({ error: "amendmentReason is required for amendments" }, { status: 400 });
      // Strip non-updateable fields
      delete updateFields.dischargeId;
      delete updateFields.action;
      delete updateFields.amendmentReason;
      delete updateFields.id;
      delete updateFields.admissionId;
      delete updateFields.patientId;
      delete updateFields.dischargeNumber;
      delete updateFields.isFinalized;
      delete updateFields.finalizedAt;
      delete updateFields.finalizedById;

      const updated = await db.dischargeRecord.update({
        where: { id: dischargeId },
        data: {
          ...updateFields,
          amendedById: session.user.id,
          amendedAt: now,
          amendmentReason,
          version: { increment: 1 },
        },
      });
      await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: discharge.facilityId || undefined, action: "DISCHARGE_AMENDED", resourceType: "discharge_record", resourceId: dischargeId, oldValues: { finalDiagnosis: discharge.finalDiagnosis, dischargeSummary: discharge.dischargeSummary }, newValues: { amendmentReason, ...updateFields } });
      return NextResponse.json({ item: updated });
    }

    if (action === "update") {
      // Generic update of editable fields (before finalization)
      if (discharge.isFinalized) return NextResponse.json({ error: "Cannot update finalized discharge. Use amend." }, { status: 400 });
      const { ...updateFields } = body;
      delete updateFields.dischargeId;
      delete updateFields.action;
      delete updateFields.id;
      delete updateFields.admissionId;
      delete updateFields.patientId;
      delete updateFields.dischargeNumber;
      delete updateFields.isFinalized;
      // Convert date fields
      const dateFields = ["proposedDischargeAt", "followUpAppointmentDate", "deathDate", "abscondedLastSeenAt", "expectedDischargeAt"];
      for (const f of dateFields) {
        if (updateFields[f]) updateFields[f] = new Date(updateFields[f]);
      }
      const updated = await db.dischargeRecord.update({
        where: { id: dischargeId },
        data: updateFields,
      });
      return NextResponse.json({ item: updated });
    }

    if (action === "clear") {
      // Mark a clearance type as cleared
      const { clearanceType, cleared } = body;
      const validTypes = ["clinical", "nursing", "financial", "pharmacy"];
      if (!validTypes.includes(clearanceType)) return NextResponse.json({ error: `clearanceType must be one of: ${validTypes.join(", ")}` }, { status: 400 });
      const clearedBool = cleared !== false;
      const updateData: any = {
        [`${clearanceType}Cleared`]: clearedBool,
        [`${clearanceType}ClearedById`]: clearedBool ? session.user.id : null,
        [`${clearanceType}ClearedAt`]: clearedBool ? now : null,
      };
      const updated = await db.dischargeRecord.update({
        where: { id: dischargeId },
        data: updateData,
      });
      await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: discharge.facilityId || undefined, action: `DISCHARGE_${clearanceType.toUpperCase()}_CLEARANCE`, resourceType: "discharge_record", resourceId: dischargeId, newValues: { cleared: clearedBool } });
      return NextResponse.json({ item: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to process discharge action" }, { status: 400 });
  }
}
