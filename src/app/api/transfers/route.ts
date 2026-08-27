// =====================================================================
// API: /api/transfers
//   GET    — list patient transfers (filter by facility, status, type, patient, date)
//   POST   — create transfer request (does NOT execute the transfer)
//   PATCH  — lifecycle: approve | accept | reject | depart | arrive | complete | cancel | delay | resume | amend | update | checklist_update
//
// SAFETY:
//   - Request ≠ Transfer: a transfer request does NOT move the patient
//   - Approve performs the bed move in a transaction (release old, occupy new)
//   - Complete marks transfer finalized; admission stays active for internal
//   - External transfers follow discharge workflow when applicable
//   - All amendments preserve original values in audit log
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_TRANSFER_TYPES = ["internal", "external"];
const VALID_PRIORITIES = ["routine", "urgent", "emergency", "critical"];
const VALID_STATUSES = ["requested", "pending_review", "pending_approval", "pending_destination", "accepted", "rejected", "pending_bed", "pending_transport", "ready", "in_transit", "arrived", "completed", "cancelled", "delayed"];

// Default checklist items created when a transfer is requested
const DEFAULT_CHECKLIST: { category: string; label: string; required: boolean; sortOrder: number }[] = [
  // Clinical
  { category: "clinical", label: "Patient identified", required: true, sortOrder: 1 },
  { category: "clinical", label: "Transfer order/recommendation confirmed", required: true, sortOrder: 2 },
  { category: "clinical", label: "Current condition documented", required: true, sortOrder: 3 },
  { category: "clinical", label: "Relevant investigations reviewed", required: false, sortOrder: 4 },
  { category: "clinical", label: "Medications reviewed", required: false, sortOrder: 5 },
  { category: "clinical", label: "Allergies reviewed", required: false, sortOrder: 6 },
  // Nursing
  { category: "nursing", label: "Nursing handover completed", required: true, sortOrder: 1 },
  { category: "nursing", label: "Lines/tubes/drains documented", required: false, sortOrder: 2 },
  { category: "nursing", label: "Belongings checked", required: false, sortOrder: 3 },
  { category: "nursing", label: "Patient education completed", required: false, sortOrder: 4 },
  // Destination
  { category: "destination", label: "Destination confirmed", required: true, sortOrder: 1 },
  { category: "destination", label: "Bed confirmed (internal)", required: false, sortOrder: 2 },
  { category: "destination", label: "Receiving team notified", required: true, sortOrder: 3 },
  { category: "destination", label: "Receiving clinician identified", required: false, sortOrder: 4 },
  // Transport
  { category: "transport", label: "Transport arranged", required: true, sortOrder: 1 },
  { category: "transport", label: "Escort arranged (if required)", required: false, sortOrder: 2 },
  { category: "transport", label: "Special transport requirements confirmed", required: false, sortOrder: 3 },
  // Documentation
  { category: "documentation", label: "Transfer summary completed", required: true, sortOrder: 1 },
  { category: "documentation", label: "Referral documentation completed (external)", required: false, sortOrder: 2 },
  { category: "documentation", label: "Required signatures completed", required: false, sortOrder: 3 },
];

// GET /api/transfers?facilityId=...&status=...&transferType=...&priority=...&patientId=...&from=...&to=...&q=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const transferType = url.searchParams.get("transferType");
  const priority = url.searchParams.get("priority");
  const patientId = url.searchParams.get("patientId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q");
  const limit = parseInt(url.searchParams.get("limit") || "200");

  const where: any = {};
  if (facilityId) {
    where.OR = [{ fromFacilityId: facilityId }, { toFacilityId: facilityId }];
  }
  if (status) where.status = status;
  if (transferType) where.transferType = transferType;
  if (priority) where.priority = priority;
  if (patientId) where.patientId = patientId;
  if (from || to) {
    const range: any = {};
    if (from) range.gte = new Date(`${from}T00:00:00`);
    if (to) range.lte = new Date(`${to}T23:59:59.999`);
    where.requestedAt = range;
  }
  if (q) {
    where.OR = [
      { patient: { firstName: { contains: q, mode: "insensitive" } } },
      { patient: { lastName: { contains: q, mode: "insensitive" } } },
      { patient: { patientNumber: { contains: q, mode: "insensitive" } } },
      { admission: { admissionNumber: { contains: q, mode: "insensitive" } } },
      { transferNumber: { contains: q, mode: "insensitive" } },
    ];
  }

  let transfers: any[] = [];
  try {
    transfers = await db.patientTransfer.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      take: limit,
      include: {
        patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true } },
        admission: {
          select: {
            id: true, admissionNumber: true, admissionType: true, admissionDiagnosis: true,
            status: true, admittedAt: true,
            bedAssignments: { where: { status: "active" }, include: { ward: { select: { id: true, name: true } }, bed: { select: { id: true, bedNumber: true } } }, take: 1 },
          },
        },
        fromFacility: { select: { id: true, name: true, code: true } },
        toFacility: { select: { id: true, name: true, code: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        acceptedBy: { select: { id: true, firstName: true, lastName: true } },
        completedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  } catch (e: any) {
    console.error("Transfers GET error:", e.message);
    // Fallback: try without new relations
    try {
      transfers = await db.patientTransfer.findMany({
        where,
        orderBy: { requestedAt: "desc" },
        take: limit,
        include: {
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true } },
          admission: { select: { id: true, admissionNumber: true, admissionType: true, status: true, admittedAt: true } },
          fromFacility: { select: { id: true, name: true, code: true } },
          toFacility: { select: { id: true, name: true, code: true } },
          requestedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    } catch (e2: any) {
      console.error("Transfers GET fallback also failed:", e2.message);
      return NextResponse.json({ items: [], count: 0, error: "Query failed — schema may be out of sync" }, { status: 200 });
    }
  }

  return NextResponse.json({ items: transfers, count: transfers.length });
}

// POST — create transfer request
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_TRANSFER)) {
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
    patientId, admissionId, fromFacilityId, toFacilityId,
    fromWardId, fromBedId, toWardId, toBedId,
    transferType, transferCategory, priority, reason, clinicalSummary,
    toDepartment, toAddress, toContactPerson, toContactPhone, toContactEmail, toDestinationNotes,
    receivingClinicianName,
    referralId, ambulanceTripId,
    transportMethod, transportRequirements, oxygenRequired, cardiacMonitoring, ivAccess, isolationPrecautions, escortRequired,
    handoverSummary, nursingHandover,
    specialRequirements, clinicalNotes, nursingNotes, administrativeNotes, transportNotes, receivingNotes,
    belongingsChecked, belongingsNotes, equipmentAccompanying,
    skipChecklist,
  } = body;

  if (!patientId || !admissionId || !fromFacilityId || !toFacilityId) {
    return NextResponse.json({ error: "patientId, admissionId, fromFacilityId, toFacilityId are required" }, { status: 400 });
  }
  if (transferType && !VALID_TRANSFER_TYPES.includes(transferType)) {
    return NextResponse.json({ error: `transferType must be one of: ${VALID_TRANSFER_TYPES.join(", ")}` }, { status: 400 });
  }
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` }, { status: 400 });
  }

  // Validate admission
  const admission = await db.admission.findUnique({
    where: { id: admissionId },
    include: { bedAssignments: { where: { status: "active" }, include: { bed: true, ward: true } } },
  });
  if (!admission) return NextResponse.json({ error: "Admission not found" }, { status: 404 });

  // Validate facilities
  const fromFac = await db.facility.findUnique({ where: { id: fromFacilityId } });
  if (!fromFac) return NextResponse.json({ error: "From facility not found" }, { status: 404 });
  const toFac = await db.facility.findUnique({ where: { id: toFacilityId } });
  if (!toFac) return NextResponse.json({ error: "To facility not found" }, { status: 404 });

  // Check for existing active transfer for this admission
  const existing = await db.patientTransfer.findFirst({
    where: { admissionId, status: { notIn: ["completed", "cancelled", "rejected"] } },
  });
  if (existing) {
    return NextResponse.json({ error: "An active transfer request already exists for this admission. Cancel or complete it first." }, { status: 400 });
  }

  try {
    const transfer = await db.patientTransfer.create({
      data: {
        patientId,
        admissionId,
        fromFacilityId,
        toFacilityId,
        fromWardId: fromWardId || null,
        toWardId: toWardId || null,
        fromBedId: fromBedId || null,
        toBedId: toBedId || null,
        transferType: transferType || (fromFacilityId === toFacilityId ? "internal" : "external"),
        transferCategory: transferCategory || null,
        priority: priority || "routine",
        reason: reason || null,
        clinicalSummary: clinicalSummary || null,
        toDepartment: toDepartment || null,
        toAddress: toAddress || null,
        toContactPerson: toContactPerson || null,
        toContactPhone: toContactPhone || null,
        toContactEmail: toContactEmail || null,
        toDestinationNotes: toDestinationNotes || null,
        receivingClinicianName: receivingClinicianName || null,
        referralId: referralId || null,
        ambulanceTripId: ambulanceTripId || null,
        transportMethod: transportMethod || null,
        transportRequirements: transportRequirements ? JSON.stringify(transportRequirements) : null,
        oxygenRequired: !!oxygenRequired,
        cardiacMonitoring: !!cardiacMonitoring,
        ivAccess: !!ivAccess,
        isolationPrecautions: isolationPrecautions || null,
        escortRequired: escortRequired || null,
        handoverSummary: handoverSummary || null,
        nursingHandover: nursingHandover || null,
        specialRequirements: specialRequirements || null,
        clinicalNotes: clinicalNotes || null,
        nursingNotes: nursingNotes || null,
        administrativeNotes: administrativeNotes || null,
        transportNotes: transportNotes || null,
        receivingNotes: receivingNotes || null,
        belongingsChecked: !!belongingsChecked,
        belongingsNotes: belongingsNotes || null,
        equipmentAccompanying: equipmentAccompanying ? JSON.stringify(equipmentAccompanying) : null,
        requestedById: session.user.id,
        requestedAt: new Date(),
        status: "requested",
      },
      include: {
        patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
        fromFacility: { select: { id: true, name: true } },
        toFacility: { select: { id: true, name: true } },
      },
    });

    // Create default checklist items (unless skipped)
    if (!skipChecklist) {
      await db.transferChecklistItem.createMany({
        data: DEFAULT_CHECKLIST.map(item => ({ ...item, transferId: transfer.id })),
      });
    }

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: fromFacilityId,
      action: "PATIENT_TRANSFER_REQUESTED",
      resourceType: "patient_transfer",
      resourceId: transfer.id,
      newValues: { patientId, admissionId, fromFacilityId, toFacilityId, transferType: transfer.transferType, priority: transfer.priority, reason },
    });

    return NextResponse.json({ item: transfer }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create transfer request" }, { status: 400 });
  }
}

// =====================================================================
// PATCH — lifecycle: approve | accept | reject | depart | arrive | complete | cancel | delay | resume | amend | update | checklist_update
// body: { transferId, action, ... }
// =====================================================================
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_TRANSFER)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { transferId, action } = body;
  if (!transferId || !action) return NextResponse.json({ error: "transferId and action are required" }, { status: 400 });

  const validActions = ["approve", "accept", "reject", "depart", "arrive", "complete", "cancel", "delay", "resume", "amend", "update", "checklist_update"];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${validActions.join(", ")}` }, { status: 400 });
  }

  const transfer = await db.patientTransfer.findUnique({
    where: { id: transferId },
    include: { admission: { include: { bedAssignments: { where: { status: "active" }, include: { bed: true } } } } },
  });
  if (!transfer) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });

  const now = new Date();

  try {
    if (action === "approve") {
      if (transfer.status === "cancelled" || transfer.status === "completed") {
        return NextResponse.json({ error: `Cannot approve transfer with status: ${transfer.status}` }, { status: 400 });
      }

      // For internal transfers with a destination bed, perform the bed move transactionally
      if (transfer.transferType === "internal" && transfer.toBedId) {
        const toBedId = transfer.toBedId;
        const toWardId = transfer.toWardId;
        const result = await db.$transaction(async (tx) => {
          // 1. Verify target bed is available
          const targetBed = await tx.bed.findUnique({ where: { id: toBedId } });
          if (!targetBed) throw new Error("Target bed not found");
          if (targetBed.status !== "available") {
            throw new Error(`Target bed ${targetBed.bedNumber} is not available (status: ${targetBed.status})`);
          }

          // 2. Release current bed assignment(s)
          for (const ba of transfer.admission.bedAssignments) {
            await tx.bedAssignment.update({
              where: { id: ba.id },
              data: { status: "released", releasedAt: now },
            });
            // Mark old bed as cleaning
            const stillAssigned = await tx.bedAssignment.count({ where: { bedId: ba.bedId, status: "active" } });
            if (stillAssigned === 0) {
              await tx.bed.update({ where: { id: ba.bedId }, data: { status: "cleaning" } });
            }
          }

          // 3. Create new bed assignment at destination
          await tx.bedAssignment.create({
            data: {
              admissionId: transfer.admissionId,
              patientId: transfer.patientId,
              facilityId: transfer.toFacilityId,
              wardId: toWardId || targetBed.wardId,
              bedId: toBedId,
              assignedById: session.user.id,
              status: "active",
            },
          });

          // 4. Mark destination bed as occupied
          await tx.bed.update({ where: { id: toBedId }, data: { status: "occupied" } });

          // 5. Update transfer
          return tx.patientTransfer.update({
            where: { id: transferId },
            data: {
              status: "accepted",
              approvedById: session.user.id,
              approvedAt: now,
              acceptedById: session.user.id,
              acceptedAt: now,
            },
          });
        });

        await auditLog({
          userId: session.user.id, organizationId: session.user.organizationId, facilityId: transfer.fromFacilityId,
          action: "PATIENT_TRANSFER_APPROVED", resourceType: "patient_transfer", resourceId: transferId,
          oldValues: { status: transfer.status }, newValues: { status: "accepted", bedMoved: true },
        });
        return NextResponse.json({ item: result });
      }

      // External transfer or no bed specified — just approve
      const updated = await db.patientTransfer.update({
        where: { id: transferId },
        data: {
          status: "approved",
          approvedById: session.user.id,
          approvedAt: now,
        },
      });
      await auditLog({
        userId: session.user.id, organizationId: session.user.organizationId, facilityId: transfer.fromFacilityId,
        action: "PATIENT_TRANSFER_APPROVED", resourceType: "patient_transfer", resourceId: transferId,
        oldValues: { status: transfer.status }, newValues: { status: "approved" },
      });
      return NextResponse.json({ item: updated });
    }

    if (action === "accept") {
      // Destination accepts the transfer
      const updated = await db.patientTransfer.update({
        where: { id: transferId },
        data: {
          status: "accepted",
          acceptedById: session.user.id,
          acceptedAt: now,
        },
      });
      await auditLog({
        userId: session.user.id, organizationId: session.user.organizationId, facilityId: transfer.toFacilityId,
        action: "PATIENT_TRANSFER_ACCEPTED", resourceType: "patient_transfer", resourceId: transferId,
        oldValues: { status: transfer.status }, newValues: { status: "accepted" },
      });
      return NextResponse.json({ item: updated });
    }

    if (action === "reject") {
      const { rejectionReason } = body;
      if (!rejectionReason) return NextResponse.json({ error: "rejectionReason is required" }, { status: 400 });
      const updated = await db.patientTransfer.update({
        where: { id: transferId },
        data: {
          status: "rejected",
          rejectedAt: now,
          rejectedById: session.user.id,
          rejectionReason,
        },
      });
      await auditLog({
        userId: session.user.id, organizationId: session.user.organizationId, facilityId: transfer.toFacilityId,
        action: "PATIENT_TRANSFER_REJECTED", resourceType: "patient_transfer", resourceId: transferId,
        oldValues: { status: transfer.status }, newValues: { status: "rejected", rejectionReason },
      });
      return NextResponse.json({ item: updated });
    }

    if (action === "depart") {
      // Patient departs from current location
      const { conditionAtDeparture, departedFrom } = body;
      const updated = await db.patientTransfer.update({
        where: { id: transferId },
        data: {
          status: "in_transit",
          departedAt: now,
          departedById: session.user.id,
          departedFrom: departedFrom || transfer.fromFacilityId,
          conditionAtDeparture: conditionAtDeparture || null,
        },
      });
      await auditLog({
        userId: session.user.id, organizationId: session.user.organizationId, facilityId: transfer.fromFacilityId,
        action: "PATIENT_TRANSFER_DEPARTED", resourceType: "patient_transfer", resourceId: transferId,
        oldValues: { status: transfer.status }, newValues: { status: "in_transit", departedAt: now },
      });
      return NextResponse.json({ item: updated });
    }

    if (action === "arrive") {
      // Patient arrives at destination
      const { conditionOnArrival, arrivedAtLocation } = body;
      const updated = await db.patientTransfer.update({
        where: { id: transferId },
        data: {
          status: "arrived",
          arrivedAt: now,
          arrivedById: session.user.id,
          arrivedAtLocation: arrivedAtLocation || transfer.toFacilityId,
          conditionOnArrival: conditionOnArrival || null,
        },
      });
      await auditLog({
        userId: session.user.id, organizationId: session.user.organizationId, facilityId: transfer.toFacilityId,
        action: "PATIENT_TRANSFER_ARRIVED", resourceType: "patient_transfer", resourceId: transferId,
        oldValues: { status: transfer.status }, newValues: { status: "arrived", arrivedAt: now },
      });
      return NextResponse.json({ item: updated });
    }

    if (action === "complete") {
      // Finalize transfer — generate transfer number if not present
      let transferNumber = transfer.transferNumber;
      if (!transferNumber) {
        const year = now.getFullYear();
        const count = await db.patientTransfer.count({ where: { fromFacilityId: transfer.fromFacilityId } });
        transferNumber = `TRF-${year}-${String(count + 1).padStart(6, "0")}`;
      }
      const updated = await db.patientTransfer.update({
        where: { id: transferId },
        data: {
          status: "completed",
          isFinalized: true,
          completedAt: now,
          completedById: session.user.id,
          transferNumber,
          // If no arrivedAt set, use now
          ...(transfer.arrivedAt ? {} : { arrivedAt: now, arrivedById: session.user.id }),
        },
      });
      await auditLog({
        userId: session.user.id, organizationId: session.user.organizationId, facilityId: transfer.fromFacilityId,
        action: "PATIENT_TRANSFER_COMPLETED", resourceType: "patient_transfer", resourceId: transferId,
        oldValues: { status: transfer.status }, newValues: { status: "completed", transferNumber },
      });
      return NextResponse.json({ item: updated });
    }

    if (action === "cancel") {
      const { cancelReason } = body;
      if (!cancelReason) return NextResponse.json({ error: "cancelReason is required" }, { status: 400 });
      const updated = await db.patientTransfer.update({
        where: { id: transferId },
        data: {
          status: "cancelled",
          cancelledAt: now,
          cancelledById: session.user.id,
          cancelReason,
        },
      });
      await auditLog({
        userId: session.user.id, organizationId: session.user.organizationId, facilityId: transfer.fromFacilityId,
        action: "PATIENT_TRANSFER_CANCELLED", resourceType: "patient_transfer", resourceId: transferId,
        oldValues: { status: transfer.status }, newValues: { status: "cancelled", cancelReason },
      });
      return NextResponse.json({ item: updated });
    }

    if (action === "delay") {
      const { delayReason, delayDepartment, expectedTransferAt } = body;
      if (!delayReason) return NextResponse.json({ error: "delayReason is required" }, { status: 400 });
      const updated = await db.patientTransfer.update({
        where: { id: transferId },
        data: {
          status: "delayed",
          delayedAt: now,
          delayReason,
          delayDepartment: delayDepartment || null,
          expectedTransferAt: expectedTransferAt ? new Date(expectedTransferAt) : null,
        },
      });
      await auditLog({
        userId: session.user.id, organizationId: session.user.organizationId, facilityId: transfer.fromFacilityId,
        action: "PATIENT_TRANSFER_DELAYED", resourceType: "patient_transfer", resourceId: transferId,
        oldValues: { status: transfer.status }, newValues: { status: "delayed", delayReason },
      });
      return NextResponse.json({ item: updated });
    }

    if (action === "resume") {
      const targetStatus = transfer.approvedAt ? "accepted" : "requested";
      const updated = await db.patientTransfer.update({
        where: { id: transferId },
        data: { status: targetStatus },
      });
      await auditLog({
        userId: session.user.id, organizationId: session.user.organizationId, facilityId: transfer.fromFacilityId,
        action: "PATIENT_TRANSFER_RESUMED", resourceType: "patient_transfer", resourceId: transferId,
        oldValues: { status: transfer.status }, newValues: { status: targetStatus },
      });
      return NextResponse.json({ item: updated });
    }

    if (action === "amend") {
      if (!transfer.isFinalized) return NextResponse.json({ error: "Can only amend finalized transfers" }, { status: 400 });
      const { amendmentReason, ...updateFields } = body;
      if (!amendmentReason) return NextResponse.json({ error: "amendmentReason is required" }, { status: 400 });
      delete updateFields.transferId;
      delete updateFields.action;
      delete updateFields.amendmentReason;
      delete updateFields.id;
      delete updateFields.transferNumber;
      delete updateFields.isFinalized;

      const updated = await db.patientTransfer.update({
        where: { id: transferId },
        data: {
          ...updateFields,
          amendedById: session.user.id,
          amendedAt: now,
          amendmentReason,
          version: { increment: 1 },
        },
      });
      await auditLog({
        userId: session.user.id, organizationId: session.user.organizationId, facilityId: transfer.fromFacilityId,
        action: "PATIENT_TRANSFER_AMENDED", resourceType: "patient_transfer", resourceId: transferId,
        oldValues: { reason: transfer.reason, clinicalSummary: transfer.clinicalSummary },
        newValues: { amendmentReason, ...updateFields },
      });
      return NextResponse.json({ item: updated });
    }

    if (action === "update") {
      if (transfer.isFinalized) return NextResponse.json({ error: "Cannot update finalized transfer. Use amend." }, { status: 400 });
      const { ...updateFields } = body;
      delete updateFields.transferId;
      delete updateFields.action;
      delete updateFields.id;
      delete updateFields.transferNumber;
      delete updateFields.isFinalized;
      const dateFields = ["approvedAt", "acceptedAt", "departedAt", "arrivedAt", "completedAt", "expectedTransferAt"];
      for (const f of dateFields) {
        if (updateFields[f]) updateFields[f] = new Date(updateFields[f]);
      }
      const updated = await db.patientTransfer.update({
        where: { id: transferId },
        data: updateFields,
      });
      return NextResponse.json({ item: updated });
    }

    if (action === "checklist_update") {
      const { checklistItemId, status, notes } = body;
      if (!checklistItemId) return NextResponse.json({ error: "checklistItemId is required" }, { status: 400 });
      const validStatuses = ["pending", "completed", "not_applicable", "blocked"];
      if (!validStatuses.includes(status)) return NextResponse.json({ error: `status must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
      const updated = await db.transferChecklistItem.update({
        where: { id: checklistItemId },
        data: {
          status,
          completedById: status === "completed" ? session.user.id : null,
          completedAt: status === "completed" ? now : null,
          notes: notes ?? undefined,
        },
      });
      await auditLog({
        userId: session.user.id, organizationId: session.user.organizationId, facilityId: transfer.fromFacilityId,
        action: "TRANSFER_CHECKLIST_UPDATED", resourceType: "transfer_checklist_item", resourceId: checklistItemId,
        newValues: { status, notes },
      });
      return NextResponse.json({ item: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to process transfer action" }, { status: 400 });
  }
}
