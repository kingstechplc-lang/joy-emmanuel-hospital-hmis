// =====================================================================
// API: /api/imaging/[id]
//   GET   — single imaging order with report
//   PATCH — status transitions:
//           schedule    → set scheduledAt, status=scheduled
//           perform     → status=in_progress
//           report     → create/update ImagingReport with findings & impression, status=completed
//           verify     → status=verified + set verifiedById/verifiedAt on report
//           release    → status=released
//           cancel     → status=cancelled
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
      report: true,
    },
  });

  if (!order) return NextResponse.json({ error: "Imaging order not found" }, { status: 404 });
  return NextResponse.json({ item: order });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMAGING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action } = body;

  const existing = await db.imagingOrder.findUnique({
    where: { id },
    include: { report: true },
  });
  if (!existing) return NextResponse.json({ error: "Imaging order not found" }, { status: 404 });

  // ---- SCHEDULE ----
  if (action === "schedule") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_PERFORM)) {
      return NextResponse.json({ error: "Missing imaging.perform permission" }, { status: 403 });
    }
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    const updated = await db.imagingOrder.update({
      where: { id },
      data: { status: "scheduled", scheduledAt },
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

  // ---- PERFORM ----
  if (action === "perform") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_PERFORM)) {
      return NextResponse.json({ error: "Missing imaging.perform permission" }, { status: 403 });
    }
    const updated = await db.imagingOrder.update({
      where: { id },
      data: { status: "in_progress" },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "IMAGING_PERFORMED",
      resourceType: "imaging_order",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "in_progress" },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- REPORT ----
  if (action === "report") {
    if (!hasPermission(session, PERMISSIONS.IMAGING_REPORT)) {
      return NextResponse.json({ error: "Missing imaging.report permission" }, { status: 403 });
    }
    const { findings, impression } = body;
    if (!findings && !impression) {
      return NextResponse.json({ error: "findings or impression is required" }, { status: 400 });
    }

    // Preserve an existing "Indication:" prefix when present in findings
    const previousFindings = existing.report?.findings || "";
    const indicationMatch = previousFindings.match(/^Indication:[^\n]*\n?/i);
    const indicationPrefix = indicationMatch ? indicationMatch[0] : "";
    const finalFindings = (indicationPrefix ? indicationPrefix + (findings || "") : (findings || "")).trim();

    let report;
    if (existing.report) {
      report = await db.imagingReport.update({
        where: { imagingOrderId: id },
        data: {
          findings: finalFindings || null,
          impression: impression || null,
          reportedById: session.user.id,
          reportedAt: new Date(),
          status: "verified",
        },
      });
    } else {
      report = await db.imagingReport.create({
        data: {
          imagingOrderId: id,
          patientId: existing.patientId,
          findings: finalFindings || null,
          impression: impression || null,
          reportedById: session.user.id,
          reportedAt: new Date(),
          status: "verified",
        },
      });
    }

    const updated = await db.imagingOrder.update({
      where: { id },
      data: { status: "completed" },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "IMAGING_REPORTED",
      resourceType: "imaging_report",
      resourceId: report.id,
      newValues: {
        imagingOrderId: id,
        findings: finalFindings,
        impression,
        status: "completed",
      },
    });

    return NextResponse.json({ item: updated, report });
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
    if (existing.report) {
      await db.imagingReport.update({
        where: { imagingOrderId: id },
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
    if (existing.report) {
      await db.imagingReport.update({
        where: { imagingOrderId: id },
        data: { status: "released" },
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
    const updated = await db.imagingOrder.update({
      where: { id },
      data: { status: "cancelled" },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: "IMAGING_CANCELLED",
      resourceType: "imaging_order",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "cancelled" },
    });
    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
