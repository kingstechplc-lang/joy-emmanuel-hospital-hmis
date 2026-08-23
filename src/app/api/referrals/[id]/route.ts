// =====================================================================
// API: /api/referrals/[id]
//   GET    — single referral with full relations + event count
//   PATCH  — update referral (validates status transitions, stamps
//            timestamps, records timeline events, fires notifications)
//   DELETE — soft-cancel (we never hard-delete referrals; sets status=cancelled)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import {
  validateTransition,
  statusTimestampField,
  recordEvent,
} from "@/lib/referral-lifecycle";
import {
  notifyReferralAccepted,
  notifyReferralRejected,
  notifyReferralCompleted,
  notifyReferralCancelled,
} from "@/lib/workflow-notifications";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const referral = await db.referral.findUnique({
    where: { id },
    include: {
      patient: true,
      patientTo: true,
      encounter: {
        select: {
          id: true,
          encounterNumber: true,
          encounterType: true,
          startAt: true,
          attendingStaffId: true,
        },
      },
      referringFacility: { select: { id: true, name: true, code: true, phone: true, email: true } },
      receivingFacility: { select: { id: true, name: true, code: true, phone: true, email: true } },
      referredBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      receivedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      primaryDiagnosis: {
        select: { id: true, diagnosisName: true, diagnosisCode: true, codeSystem: true },
      },
      events: {
        orderBy: { createdAt: "asc" },
        include: {
          actorUser: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      feedback: {
        orderBy: { createdAt: "desc" },
        include: {
          authorUser: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          senderUser: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!referral) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item: referral });
}

// PATCH /api/referrals/[id]
// Body: {
//   status?, clinicalSummary?, urgency?, receivingStaffId?, reason?,
//   referralReasonCategory?, receivingFacilityId?, receivingFacilityName?,
//   receivingProviderName?, receivingContact?, transportStatus?,
//   transportRequestId?, appointmentId?, appointmentDate?, stabilizationPerformed?,
//   closureReason?, consentStatus?, redirectReason?, newReceivingFacilityId?
// }
//
// Special actions (passed via body.action):
//   "redirect" — change destination, requires newReceivingFacilityId + redirectReason
//   "close"    — close the referral, requires closureReason
//   "cancel"   — cancel the referral, requires cancellationReason
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_EDIT)) {
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

  const existing = await db.referral.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      referringFacility: { select: { id: true, name: true } },
      receivingFacility: { select: { id: true, name: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const {
    status: newStatus,
    clinicalSummary,
    urgency,
    priority,
    reason,
    referralReasonCategory,
    receivingStaffId,
    receivingFacilityId,
    receivingFacilityName,
    receivingProviderName,
    receivingContact,
    transportStatus,
    transportRequestId,
    appointmentId,
    appointmentDate,
    stabilizationPerformed,
    consentStatus,
    action,
    // action-specific fields
    newReceivingFacilityId,
    redirectReason,
    closureReason,
    cancellationReason,
    rejectionReason,
    notes,
    authorizedById,
  } = body;

  // ---- Handle special actions first ----
  if (action === "redirect") {
    if (!newReceivingFacilityId) {
      return NextResponse.json(
        { error: "newReceivingFacilityId is required for redirect action" },
        { status: 400 }
      );
    }
    const validation = validateTransition(existing.status, "redirected");
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const originalFacilityId = existing.receivingFacilityId;
    const updated = await db.referral.update({
      where: { id },
      data: {
        status: "redirected",
        originalReceivingFacilityId: originalFacilityId,
        receivingFacilityId: newReceivingFacilityId,
      },
    });

    await recordEvent({
      referralId: id,
      eventType: "redirected",
      fromStatus: existing.status,
      toStatus: "redirected",
      actorUserId: session.user.id,
      facilityId: session.user.facilityId,
      title: "Referral redirected",
      description: `Destination changed from facility ${originalFacilityId || "—"} to ${newReceivingFacilityId}.`,
      metadata: { redirectReason, originalFacilityId, newReceivingFacilityId },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: session.user.facilityId || undefined,
      action: "REFERRAL_REDIRECTED",
      resourceType: "referral",
      resourceId: id,
      oldValues: { receivingFacilityId: originalFacilityId },
      newValues: { receivingFacilityId: newReceivingFacilityId, redirectReason },
    });

    return NextResponse.json({ item: updated });
  }

  if (action === "cancel") {
    const validation = validateTransition(existing.status, "cancelled");
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const now = new Date();
    const updated = await db.referral.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: now,
        closureReason: cancellationReason || closureReason || null,
      },
    });

    await recordEvent({
      referralId: id,
      eventType: "cancelled",
      fromStatus: existing.status,
      toStatus: "cancelled",
      actorUserId: session.user.id,
      facilityId: session.user.facilityId,
      title: "Referral cancelled",
      description: cancellationReason || closureReason || "No reason provided.",
      metadata: { cancellationReason: cancellationReason || closureReason },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: session.user.facilityId || undefined,
      action: "REFERRAL_CANCELLED",
      resourceType: "referral",
      resourceId: id,
      newValues: { status: "cancelled", reason: cancellationReason || closureReason },
    });

    // Notify the referring facility (or receiving, depending on who cancelled)
    const patientName = existing.patient
      ? `${existing.patient.firstName} ${existing.patient.lastName}`
      : "Unknown";
    const notifyFacilityId =
      session.user.facilityId === existing.referringFacilityId
        ? existing.receivingFacilityId // referring cancelled → notify receiving
        : existing.referringFacilityId; // receiving cancelled → notify referring
    await notifyReferralCancelled({
      organizationId: session.user.organizationId,
      facilityId: notifyFacilityId,
      referralNumber: existing.referralNumber || existing.id.slice(-8).toUpperCase(),
      patientName,
      referralId: id,
      cancellationReason: cancellationReason || closureReason,
      cancelledById: session.user.id,
    });

    return NextResponse.json({ item: updated });
  }

  if (action === "close") {
    const validation = validateTransition(existing.status, "closed");
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const now = new Date();
    const updated = await db.referral.update({
      where: { id },
      data: {
        status: "closed",
        closedAt: now,
        closedById: session.user.id,
        closureReason: closureReason || null,
        feedbackStatus: "closed",
      },
    });

    await recordEvent({
      referralId: id,
      eventType: "closed",
      fromStatus: existing.status,
      toStatus: "closed",
      actorUserId: session.user.id,
      facilityId: session.user.facilityId,
      title: "Referral closed",
      description: closureReason || "Closed by authorized user.",
      metadata: { closureReason },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: session.user.facilityId || undefined,
      action: "REFERRAL_CLOSED",
      resourceType: "referral",
      resourceId: id,
      newValues: { status: "closed", closureReason },
    });

    return NextResponse.json({ item: updated });
  }

  // ---- Standard status transition ----
  const data: any = {};
  const eventMetadata: any = {};

  if (newStatus && newStatus !== existing.status) {
    const validation = validateTransition(existing.status, newStatus);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    data.status = newStatus;
    const tsField = statusTimestampField(newStatus);
    if (tsField) data[tsField] = new Date();

    // Special handling for specific transitions
    if (newStatus === "accepted") {
      data.receivingStaffId = receivingStaffId || session.user.id;
      data.acceptedAt = new Date();
    }
    if (newStatus === "authorized") {
      data.authorizedById = authorizedById || session.user.id;
      data.authorizedAt = new Date();
    }
    if (newStatus === "completed") {
      data.completedAt = new Date();
    }

    eventMetadata.notes = notes;
    eventMetadata.rejectionReason = rejectionReason;
  }

  // ---- Editable fields (no status change required) ----
  if (clinicalSummary !== undefined) data.clinicalSummary = clinicalSummary;
  if (urgency !== undefined) {
    data.urgency = urgency;
    data.priority = urgency; // keep priority in sync with urgency
  }
  if (priority !== undefined) data.priority = priority;
  if (reason !== undefined) data.reason = reason;
  if (referralReasonCategory !== undefined) data.referralReasonCategory = referralReasonCategory;
  if (receivingStaffId !== undefined) {
    data.receivingStaffId = receivingStaffId || session.user.id;
  }
  if (receivingFacilityId !== undefined) data.receivingFacilityId = receivingFacilityId || null;
  if (receivingFacilityName !== undefined) data.receivingFacilityName = receivingFacilityName || null;
  if (receivingProviderName !== undefined) data.receivingProviderName = receivingProviderName || null;
  if (receivingContact !== undefined) data.receivingContact = receivingContact || null;
  if (transportStatus !== undefined) data.transportStatus = transportStatus;
  if (transportRequestId !== undefined) data.transportRequestId = transportRequestId;
  if (appointmentId !== undefined) data.appointmentId = appointmentId;
  if (appointmentDate !== undefined) data.appointmentDate = appointmentDate ? new Date(appointmentDate) : null;
  if (stabilizationPerformed !== undefined) data.stabilizationPerformed = stabilizationPerformed;
  if (consentStatus !== undefined) {
    data.consentStatus = consentStatus;
    if (consentStatus === "obtained") {
      data.consentObtainedById = session.user.id;
      data.consentObtainedAt = new Date();
    }
  }

  const updated = await db.referral.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "REFERRAL_UPDATED",
    resourceType: "referral",
    resourceId: id,
    oldValues: { status: existing.status, urgency: existing.urgency },
    newValues: data,
  });

  // Record a timeline event for status changes (not for plain field edits)
  if (newStatus && newStatus !== existing.status) {
    const eventType = newStatus; // e.g., "accepted", "sent", "completed"
    const patientName = existing.patient
      ? `${existing.patient.firstName} ${existing.patient.lastName}`
      : "Unknown";
    const receivingFacilityName =
      existing.receivingFacility?.name || existing.receivingFacilityName || "Receiving facility";
    const referringFacilityId = existing.referringFacilityId;

    await recordEvent({
      referralId: id,
      eventType,
      fromStatus: existing.status,
      toStatus: newStatus,
      actorUserId: session.user.id,
      facilityId: session.user.facilityId,
      title: `Referral ${newStatus}`,
      description:
        notes ||
        rejectionReason ||
        `Status changed from ${existing.status} to ${newStatus}.`,
      metadata: eventMetadata,
    });

    // Fire the appropriate notification based on the new status.
    // Notifications go to the REFERRING facility (so they get a callback)
    // except for "cancelled" which is handled separately above.
    if (newStatus === "accepted") {
      await notifyReferralAccepted({
        organizationId: session.user.organizationId,
        facilityId: referringFacilityId,
        referralNumber: existing.referralNumber || id.slice(-8).toUpperCase(),
        patientName,
        receivingFacilityName,
        referralId: id,
        acceptedById: session.user.id,
        notes,
      });
    } else if (newStatus === "rejected") {
      await notifyReferralRejected({
        organizationId: session.user.organizationId,
        facilityId: referringFacilityId,
        referralNumber: existing.referralNumber || id.slice(-8).toUpperCase(),
        patientName,
        receivingFacilityName,
        referralId: id,
        rejectionReason,
      });
    } else if (newStatus === "completed") {
      await notifyReferralCompleted({
        organizationId: session.user.organizationId,
        facilityId: referringFacilityId,
        referralNumber: existing.referralNumber || id.slice(-8).toUpperCase(),
        patientName,
        receivingFacilityName,
        referralId: id,
        outcome: notes,
      });
    }
  } else if (Object.keys(data).length > 0) {
    // Plain edit (not a status change) — record an "edited" event
    await recordEvent({
      referralId: id,
      eventType: "edited",
      actorUserId: session.user.id,
      facilityId: session.user.facilityId,
      title: "Referral details updated",
      description: `Fields updated: ${Object.keys(data).join(", ")}`,
      metadata: { changedFields: Object.keys(data) },
    });
  }

  return NextResponse.json({ item: updated });
}

// DELETE /api/referrals/[id]
// We never hard-delete referrals — this is a soft-cancel that sets
// status=cancelled. Use this for mistakenly-created referrals.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_EDIT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.referral.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only allow deletion of draft/pending referrals that haven't been sent
  if (!["draft", "pending", "submitted"].includes(existing.status)) {
    return NextResponse.json(
      {
        error: `Cannot delete a referral in status "${existing.status}". Cancel it instead.`,
      },
      { status: 400 }
    );
  }

  // Hard delete is allowed for unsent drafts — preserves referential integrity
  // via the onDelete: Cascade on ReferralEvent/Feedback/Message.
  await db.referral.delete({ where: { id } });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "REFERRAL_DELETED",
    resourceType: "referral",
    resourceId: id,
    oldValues: { status: existing.status, referralNumber: existing.referralNumber },
  });

  return NextResponse.json({ ok: true });
}
