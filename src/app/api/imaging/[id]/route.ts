// =====================================================================
// API: /api/imaging/[id]
//   GET   — single imaging order with report
//   PATCH — status transitions:
//           schedule    → set scheduledAt, status=scheduled
//           arrive      → status=arrived + patientArrivedAt
//           perform     → status=in_progress (capture DICOM fields)
//           report      → create/update ImagingReport with findings & impression, status=reported
//           verify     → status=verified + set verifiedById/verifiedAt on report
//           release    → status=released
//           amend      → create amendment version of report (preserves original)
//           reschedule → status=rescheduled + new scheduledAt
//           no_show   → status=no_show
//           cancel     → status=cancelled
//           update     → update order fields (bodySite, laterality, contrast, etc.)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { notifyImagingVerified } from "@/lib/workflow-notifications";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMAGING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const order = await db.imagingOrder.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true } },
      encounter: { select: { id: true, encounterNumber: true, encounterType: true } },
      facility: { select: { id: true, name: true, code: true } },
      orderingClinician: { select: { id: true, firstName: true, lastName: true } },
      reports: { orderBy: { version: "desc" } },
    },
  });

  if (!order) return NextResponse.json({ error: "Imaging order not found" }, { status: 404 });
  // Return the latest report as `report` for back-compat with the view
  const latestReport = order.reports.find((r: any) => r.isLatest) || order.reports[0] || null;
  return NextResponse.json({ item: { ...order, report: latestReport, reportHistory: order.reports } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMAGING_VIEW)) {
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

  const existing = await db.imagingOrder.findUnique({
    where: { id },
    include: {
      reports: { where: { isLatest: true }, take: 1 },
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Imaging order not found" }, { status: 404 });
  const existingReport = existing.reports[0] || null;

  // ---- SCHEDULE ----
  if (action === "schedule") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_PERFORM)) {
      return NextResponse.json({ error: "Missing imaging.perform permission" }, { status: 403 });
    }
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    const updated = await db.imagingOrder.update({
      where: { id },
      data: {
        status: "scheduled",
        scheduledAt,
        scheduledById: session.user.id,
        imagingRoom: body.imagingRoom || existing.imagingRoom || null,
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "IMAGING_SCHEDULED",
      resourceType: "imaging_order",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "scheduled", scheduledAt },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- ARRIVE (patient arrived at imaging) ----
  if (action === "arrive") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_PERFORM)) {
      return NextResponse.json({ error: "Missing imaging.perform permission" }, { status: 403 });
    }
    const updated = await db.imagingOrder.update({
      where: { id },
      data: { status: "arrived", patientArrivedAt: new Date() },
    });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId,
      action: "IMAGING_PATIENT_ARRIVED", resourceType: "imaging_order", resourceId: id,
      newValues: { status: "arrived" },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- RESCHEDULE ----
  if (action === "reschedule") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_PERFORM)) {
      return NextResponse.json({ error: "Missing imaging.perform permission" }, { status: 403 });
    }
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    const updated = await db.imagingOrder.update({
      where: { id },
      data: { status: "rescheduled", scheduledAt, scheduledById: session.user.id },
    });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId,
      action: "IMAGING_RESCHEDULED", resourceType: "imaging_order", resourceId: id,
      oldValues: { status: existing.status, scheduledAt: existing.scheduledAt },
      newValues: { status: "rescheduled", scheduledAt },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- NO SHOW ----
  if (action === "no_show") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_PERFORM)) {
      return NextResponse.json({ error: "Missing imaging.perform permission" }, { status: 403 });
    }
    const updated = await db.imagingOrder.update({
      where: { id },
      data: { status: "no_show" },
    });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId,
      action: "IMAGING_NO_SHOW", resourceType: "imaging_order", resourceId: id,
      newValues: { status: "no_show" },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- PERFORM (capture DICOM fields when study is performed) ----
  if (action === "perform") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_PERFORM)) {
      return NextResponse.json({ error: "Missing imaging.perform permission" }, { status: 403 });
    }
    const { accessionNumber, studyInstanceUid, seriesInstanceUid, contrastUsed, performedAt } = body;
    const updated = await db.imagingOrder.update({
      where: { id },
      data: {
        status: "in_progress",
        performedAt: performedAt ? new Date(performedAt) : new Date(),
        performedById: session.user.id,
        accessionNumber: accessionNumber || existing.accessionNumber || null,
        studyInstanceUid: studyInstanceUid || existing.studyInstanceUid || null,
        seriesInstanceUid: seriesInstanceUid || existing.seriesInstanceUid || null,
        contrastRequired: contrastUsed != null ? !!contrastUsed : existing.contrastRequired,
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "IMAGING_PERFORMED",
      resourceType: "imaging_order",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "in_progress", accessionNumber, studyInstanceUid },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- REPORT (create/update structured report, status=reported) ----
  if (action === "report") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_REPORT)) {
      return NextResponse.json({ error: "Missing imaging.report permission" }, { status: 403 });
    }
    const { findings, impression, technique, recommendations, differentialDiagnosis, followUpRecommendation, clinicalIndication } = body;
    if (!findings && !impression && !technique) {
      return NextResponse.json({ error: "findings, impression, or technique is required" }, { status: 400 });
    }

    let report;
    if (existingReport) {
      report = await db.imagingReport.update({
        where: { id: existingReport.id },
        data: {
          clinicalIndication: clinicalIndication || existingReport.clinicalIndication || null,
          technique: technique || existingReport.technique || null,
          findings: findings || existingReport.findings || null,
          impression: impression || existingReport.impression || null,
          recommendations: recommendations || existingReport.recommendations || null,
          differentialDiagnosis: differentialDiagnosis || existingReport.differentialDiagnosis || null,
          followUpRecommendation: followUpRecommendation || existingReport.followUpRecommendation || null,
          reportedById: session.user.id,
          reportedAt: new Date(),
          status: "preliminary",
        },
      });
    } else {
      report = await db.imagingReport.create({
        data: {
          imagingOrderId: id,
          patientId: existing.patientId,
          clinicalIndication: clinicalIndication || null,
          technique: technique || null,
          findings: findings || null,
          impression: impression || null,
          recommendations: recommendations || null,
          differentialDiagnosis: differentialDiagnosis || null,
          followUpRecommendation: followUpRecommendation || null,
          reportedById: session.user.id,
          reportedAt: new Date(),
          status: "preliminary",
        },
      });
    }

    const updated = await db.imagingOrder.update({
      where: { id },
      data: { status: "reported" },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "IMAGING_REPORTED",
      resourceType: "imaging_report",
      resourceId: report.id,
      newValues: { imagingOrderId: id, findings, impression, technique, status: "preliminary" },
    });

    return NextResponse.json({ item: updated, report });
  }

  // ---- AMEND (create a new report version; preserve original) ----
  if (action === "amend") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_VERIFY)) {
      return NextResponse.json({ error: "Missing imaging.verify permission to amend reports" }, { status: 403 });
    }
    const { findings, impression, technique, recommendations, amendmentReason } = body;
    if (!amendmentReason) {
      return NextResponse.json({ error: "amendmentReason is required" }, { status: 400 });
    }
    if (!existingReport) {
      return NextResponse.json({ error: "No existing report to amend" }, { status: 400 });
    }
    const oldReport = existingReport;
    const newVersion = (oldReport.version || 1) + 1;
    // Mark old report as amended (preserved in history)
    await db.imagingReport.update({
      where: { id: oldReport.id },
      data: { status: "amended", amendmentReason, isLatest: false },
    });
    // Create the new amended version as the latest
    const amended = await db.imagingReport.create({
      data: {
        imagingOrderId: id,
        patientId: existing.patientId,
        clinicalIndication: oldReport.clinicalIndication,
        technique: technique || oldReport.technique,
        findings: findings || oldReport.findings,
        impression: impression || oldReport.impression,
        recommendations: recommendations || oldReport.recommendations,
        differentialDiagnosis: oldReport.differentialDiagnosis,
        followUpRecommendation: oldReport.followUpRecommendation,
        reportedById: session.user.id,
        reportedAt: new Date(),
        status: "final",
        amendedFromId: oldReport.id,
        amendmentReason,
        amendmentApprovedById: session.user.id,
        version: newVersion,
        isLatest: true,
      },
    });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId,
      action: "IMAGING_REPORT_AMENDED", resourceType: "imaging_report", resourceId: amended.id,
      oldValues: { originalId: oldReport.id, originalFindings: oldReport.findings, originalImpression: oldReport.impression },
      newValues: { amendedId: amended.id, findings, impression, amendmentReason },
    });
    return NextResponse.json({ item: amended });
  }

  // ---- VERIFY ----
  if (action === "verify") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_VERIFY)) {
      return NextResponse.json({ error: "Missing imaging.verify permission" }, { status: 403 });
    }
    const updated = await db.imagingOrder.update({
      where: { id },
      data: { status: "verified" },
    });
    if (existingReport) {
      await db.imagingReport.update({
        where: { id: existingReport.id },
        data: { status: "verified", verifiedById: session.user.id, verifiedAt: new Date() },
      });
    }

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "IMAGING_VERIFIED",
      resourceType: "imaging_order",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "verified", verifiedById: session.user.id },
    });

    // 🔔 Notify ordering clinician that imaging report is verified
    await notifyImagingVerified({
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      orderNumber: existing.id.slice(-8).toUpperCase(),
      patientName: existing.patient ? `${existing.patient.firstName} ${existing.patient.lastName}` : "Unknown",
      orderId: id,
      orderingClinicianId: existing.orderingClinicianId || undefined,
    });

    return NextResponse.json({ item: updated });
  }

  // ---- RELEASE ----
  if (action === "release") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_VERIFY)) {
      return NextResponse.json({ error: "Missing imaging.verify permission" }, { status: 403 });
    }
    const updated = await db.imagingOrder.update({
      where: { id },
      data: { status: "released" },
    });
    if (existingReport) {
      await db.imagingReport.update({
        where: { id: existingReport.id },
        data: { status: "released", releasedAt: new Date(), releasedById: session.user.id },
      });
    }

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "IMAGING_RELEASED",
      resourceType: "imaging_order",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "released" },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- CANCEL ----
  if (action === "cancel") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_ORDER)) {
      return NextResponse.json({ error: "Missing imaging.order permission" }, { status: 403 });
    }
    const { cancellationReason } = body;
    const updated = await db.imagingOrder.update({
      where: { id },
      data: { status: "cancelled", cancelledAt: new Date(), cancelledById: session.user.id, cancellationReason: cancellationReason || null },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "IMAGING_CANCELLED",
      resourceType: "imaging_order",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "cancelled", cancellationReason },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- UPDATE (edit order fields: bodySite, laterality, contrast, serviceId, notes, etc.) ----
  if (action === "update") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_ORDER)) {
      return NextResponse.json({ error: "Missing imaging.order permission" }, { status: 403 });
    }
    const { bodySite, laterality, contrastRequired, contrastNotes, modality, serviceId, departmentId, notes, priority, clinicalIndication, diagnosisRef } = body;
    const updateData: any = {};
    if (bodySite !== undefined) updateData.bodySite = bodySite || null;
    if (laterality !== undefined) updateData.laterality = laterality || null;
    if (contrastRequired !== undefined) updateData.contrastRequired = !!contrastRequired;
    if (contrastNotes !== undefined) updateData.contrastNotes = contrastNotes || null;
    if (modality !== undefined) updateData.modality = modality || null;
    if (serviceId !== undefined) updateData.serviceId = serviceId || null;
    if (departmentId !== undefined) updateData.departmentId = departmentId || null;
    if (notes !== undefined) updateData.notes = notes || null;
    if (priority !== undefined) updateData.priority = priority;
    if (clinicalIndication !== undefined) updateData.clinicalIndication = clinicalIndication || null;
    if (diagnosisRef !== undefined) updateData.diagnosisRef = diagnosisRef || null;
    const updated = await db.imagingOrder.update({ where: { id }, data: updateData });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId: existing.facilityId,
      action: "IMAGING_ORDER_UPDATED", resourceType: "imaging_order", resourceId: id,
      newValues: updateData,
    });
    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
