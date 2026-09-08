// =====================================================================
// API: /api/discharge-summaries/[id]
//   GET    — fetch a single summary (with full content + relations)
//   PATCH  — lifecycle: review | approve | finalize | amend | update
//   DELETE — delete a draft (only "draft" status can be deleted)
//
// PERMISSIONS:
//   GET     requires  discharge_summary.view
//   PATCH   action=review  requires discharge_summary.create (clinician review)
//            action=approve requires discharge_summary.finalize
//            action=finalize requires discharge_summary.finalize
//            action=amend requires discharge_summary.finalize
//            action=update requires discharge_summary.create
//   DELETE  requires  discharge_summary.create (author or any clinician with create)
//
// STATE MACHINE:
//   draft → reviewed → approved → finalized
//                 ↘ (any state can go to amended, with amendmentReason)
//
// Finalize locks the content (no further updates allowed; must amend).
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_ACTIONS = ["review", "approve", "finalize", "amend", "update"];
const VALID_STATUSES = ["draft", "reviewed", "approved", "finalized", "amended"];

// GET /api/discharge-summaries/[id]
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DISCHARGE_SUMMARY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const summary = await db.dischargeSummary.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true, patientNumber: true, firstName: true, lastName: true,
            middleName: true, dateOfBirth: true, sex: true, gender: true,
            bloodGroup: true, phone: true, address: true, city: true, region: true,
          },
        },
        encounter: {
          select: {
            id: true, encounterNumber: true, encounterType: true, status: true,
            startAt: true, endAt: true, priority: true, source: true,
          },
        },
        admission: {
          select: {
            id: true, admissionNumber: true, admissionType: true, admittedAt: true,
            dischargedAt: true, status: true, admissionReason: true, admissionDiagnosis: true,
          },
        },
        dischargeRecord: {
          select: {
            id: true, dischargeNumber: true, dischargeType: true, disposition: true,
            dischargedAt: true, finalDiagnosis: true, procedures: true,
            dischargeConditions: true, adviceOnDischarge: true,
            sickLeaveDays: true, followUpAppointmentDate: true, followUpClinic: true,
          },
        },
        attendingClinician: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        finalizedBy: { select: { id: true, firstName: true, lastName: true } },
        amendedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!summary) {
      return NextResponse.json({ error: "Discharge summary not found" }, { status: 404 });
    }

    // Facility scoping check
    if (session.user.facilityId && summary.facilityId !== session.user.facilityId) {
      // super_admin bypasses
      if (!session.user.roles?.includes("super_admin")) {
        return NextResponse.json({ error: "Forbidden — summary belongs to another facility" }, { status: 403 });
      }
    }

    return NextResponse.json({ ...summary, content: summary.content });
  } catch (e: any) {
    console.error(`[GET /api/discharge-summaries/${id}]`, e);
    return NextResponse.json({ error: e.message || "Failed to fetch summary" }, { status: 500 });
  }
}

// PATCH /api/discharge-summaries/[id]
//   Body: { action: "review"|"approve"|"finalize"|"amend"|"update", content?, reason? (amend), note? }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${VALID_ACTIONS.join(", ")}` }, { status: 400 });
  }

  // Permission checks per action
  if (action === "finalize" || action === "amend" || action === "approve") {
    if (!hasPermission(session, PERMISSIONS.DISCHARGE_SUMMARY_FINALIZE)) {
      return NextResponse.json({ error: `Forbidden — ${action} requires discharge_summary.finalize` }, { status: 403 });
    }
  } else {
    // review, update
    if (!hasPermission(session, PERMISSIONS.DISCHARGE_SUMMARY_CREATE)) {
      return NextResponse.json({ error: `Forbidden — ${action} requires discharge_summary.create` }, { status: 403 });
    }
  }

  try {
    const existing = await db.dischargeSummary.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Discharge summary not found" }, { status: 404 });
    }

    // Facility scoping check
    if (session.user.facilityId && existing.facilityId !== session.user.facilityId) {
      if (!session.user.roles?.includes("super_admin")) {
        return NextResponse.json({ error: "Forbidden — summary belongs to another facility" }, { status: 403 });
      }
    }

    const oldValues = {
      status: existing.status,
      version: existing.version,
      content: existing.content,
      reviewedById: existing.reviewedById,
      reviewedAt: existing.reviewedAt,
      approvedById: existing.approvedById,
      approvedAt: existing.approvedAt,
      finalizedById: existing.finalizedById,
      finalizedAt: existing.finalizedAt,
    };

    // Validate state transitions
    const now = new Date();
    let newData: any = {};
    let newStatus: string = existing.status;

    if (action === "update") {
      // Update draft content — only allowed in draft/reviewed/approved (not finalized/amended)
      if (existing.status === "finalized") {
        return NextResponse.json({ error: "Cannot update a finalized summary — use amend instead" }, { status: 409 });
      }
      if (body.content !== undefined) {
        if (typeof body.content !== "string") {
          return NextResponse.json({ error: "content must be a JSON string" }, { status: 400 });
        }
        newData.content = body.content;
      }
      if (body.attendingClinicianId !== undefined) newData.attendingClinicianId = body.attendingClinicianId || null;
      if (body.primaryDiagnosisName !== undefined) newData.primaryDiagnosisName = body.primaryDiagnosisName;
      if (body.primaryDiagnosisCode !== undefined) newData.primaryDiagnosisCode = body.primaryDiagnosisCode;
      // status stays the same on update
    } else if (action === "review") {
      if (existing.status !== "draft") {
        return NextResponse.json({ error: `Cannot review a summary in '${existing.status}' status (must be draft)` }, { status: 409 });
      }
      newStatus = "reviewed";
      newData.status = newStatus;
      newData.reviewedById = session.user.id;
      newData.reviewedAt = now;
      if (typeof body.content === "string") newData.content = body.content;
    } else if (action === "approve") {
      if (existing.status !== "reviewed" && existing.status !== "draft") {
        return NextResponse.json({ error: `Cannot approve a summary in '${existing.status}' status` }, { status: 409 });
      }
      newStatus = "approved";
      newData.status = newStatus;
      newData.approvedById = session.user.id;
      newData.approvedAt = now;
      if (typeof body.content === "string") newData.content = body.content;
    } else if (action === "finalize") {
      if (existing.status !== "approved" && existing.status !== "reviewed" && existing.status !== "draft") {
        return NextResponse.json({ error: `Cannot finalize a summary in '${existing.status}' status` }, { status: 409 });
      }
      newStatus = "finalized";
      newData.status = newStatus;
      newData.finalizedById = session.user.id;
      newData.finalizedAt = now;
      if (typeof body.content === "string") newData.content = body.content;
    } else if (action === "amend") {
      if (!body.reason || !String(body.reason).trim()) {
        return NextResponse.json({ error: "Amendment reason is required" }, { status: 400 });
      }
      newStatus = "amended";
      newData.status = newStatus;
      newData.amendedById = session.user.id;
      newData.amendedAt = now;
      newData.amendmentReason = String(body.reason).trim();
      newData.version = existing.version + 1;
      if (typeof body.content === "string") newData.content = body.content;
    }

    const updated = await db.dischargeSummary.update({
      where: { id },
      data: newData,
      select: {
        id: true, summaryNumber: true, status: true, version: true, content: true,
        primaryDiagnosisName: true, primaryDiagnosisCode: true,
        attendingClinicianId: true,
        reviewedById: true, reviewedAt: true,
        approvedById: true, approvedAt: true,
        finalizedById: true, finalizedAt: true,
        amendedById: true, amendedAt: true, amendmentReason: true,
        updatedAt: true,
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: existing.organizationId,
      facilityId: existing.facilityId,
      action: `discharge_summary.${action}`,
      resourceType: "DischargeSummary",
      resourceId: id,
      oldValues,
      newValues: { ...newData, action },
      reason: body.reason || body.note || undefined,
    });

    return NextResponse.json({ ...updated, content: updated.content });
  } catch (e: any) {
    console.error(`[PATCH /api/discharge-summaries/${id}]`, e);
    return NextResponse.json({ error: e.message || "Failed to update summary" }, { status: 500 });
  }
}

// DELETE /api/discharge-summaries/[id]
//   Only "draft" summaries can be deleted (after review/approve they must be amended).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DISCHARGE_SUMMARY_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const existing = await db.dischargeSummary.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Discharge summary not found" }, { status: 404 });
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: `Cannot delete a summary in '${existing.status}' status. Only drafts can be deleted.` },
        { status: 409 },
      );
    }

    // Facility scoping check
    if (session.user.facilityId && existing.facilityId !== session.user.facilityId) {
      if (!session.user.roles?.includes("super_admin")) {
        return NextResponse.json({ error: "Forbidden — summary belongs to another facility" }, { status: 403 });
      }
    }

    await db.dischargeSummary.delete({ where: { id } });

    await auditLog({
      userId: session.user.id,
      organizationId: existing.organizationId,
      facilityId: existing.facilityId,
      action: "discharge_summary.delete",
      resourceType: "DischargeSummary",
      resourceId: id,
      oldValues: { summaryNumber: existing.summaryNumber, status: existing.status },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(`[DELETE /api/discharge-summaries/${id}]`, e);
    return NextResponse.json({ error: e.message || "Failed to delete summary" }, { status: 500 });
  }
}

export { VALID_ACTIONS, VALID_STATUSES };
