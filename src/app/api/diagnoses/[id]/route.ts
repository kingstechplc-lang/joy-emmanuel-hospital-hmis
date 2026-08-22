// =====================================================================
// API: /api/diagnoses/[id]
//   GET    — fetch single diagnosis (with status history)
//   PATCH  — update diagnosis (status change, confirm, rule out, edit notes)
//   DELETE — remove diagnosis (only if not yet confirmed; else mark inactive)
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
  if (!hasPermission(session, PERMISSIONS.DIAGNOSIS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const item = await db.diagnosis.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, organizationId: true } },
      encounter: {
        select: {
          id: true, encounterNumber: true, encounterType: true,
          facility: { select: { id: true, name: true } },
          department: { select: { id: true, name: true, code: true } },
        },
      },
      catalog: { select: { id: true, code: true, name: true, codeSystem: true, category: true } },
      statusHistory: { orderBy: { changedAt: "desc" } },
    },
  });
  if (!item || item.patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const existing = await db.diagnosis.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Verify org scope via patient
  const patient = await db.patient.findUnique({ where: { id: existing.patientId } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Permission matrix
  const isStatusChange = body.clinicalStatus !== undefined || body.verificationStatus !== undefined;
  const isConfirm = body.verificationStatus === "confirmed" && existing.verificationStatus !== "confirmed";
  const isAmendment = body.amendmentReason !== undefined;

  if (isAmendment && !hasPermission(session, PERMISSIONS.DIAGNOSIS_AMEND)) {
    return NextResponse.json({ error: "Forbidden — diagnosis.amend required" }, { status: 403 });
  }
  if (isConfirm && !hasPermission(session, PERMISSIONS.DIAGNOSIS_CONFIRM)) {
    return NextResponse.json({ error: "Forbidden — diagnosis.confirm required" }, { status: 403 });
  }
  if (!isAmendment && !isConfirm && !hasPermission(session, PERMISSIONS.DIAGNOSIS_EDIT)) {
    return NextResponse.json({ error: "Forbidden — diagnosis.edit required" }, { status: 403 });
  }

  const { id: _id, patientId: _p, encounterId: _e, catalogId: _c, createdAt: _c2, updatedAt: _u, diagnosedById: _d, ...updateData } = body;

  // If promoting to primary, demote other primaries in the same encounter
  if (updateData.isPrimary === true && !existing.isPrimary) {
    await db.diagnosis.updateMany({
      where: { encounterId: existing.encounterId, isPrimary: true, id: { not: id } },
      data: { isPrimary: false, diagnosisType: "secondary" },
    });
  }

  // Auto-set resolvedDate when status flips to resolved
  if (updateData.clinicalStatus === "resolved" && existing.clinicalStatus !== "resolved") {
    updateData.resolvedDate = new Date();
  }

  // Track status change in history
  if (isStatusChange) {
    const newStatus = body.clinicalStatus ?? existing.clinicalStatus;
    const newVerification = body.verificationStatus ?? existing.verificationStatus;
    if (newStatus !== existing.clinicalStatus || newVerification !== existing.verificationStatus) {
      await db.diagnosisStatusHistory.create({
        data: {
          diagnosisId: id,
          fromStatus: existing.clinicalStatus,
          toStatus: newStatus,
          fromVerification: existing.verificationStatus,
          toVerification: newVerification,
          changedById: session.user.id,
          changedByName: session.user.name || undefined,
          reason: body.reason || body.amendmentReason || null,
        },
      });
    }
  }

  // Strip reason/amendmentReason from update payload (not columns on Diagnosis)
  delete updateData.reason;

  const updated = await db.diagnosis.update({
    where: { id },
    data: updateData,
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: isAmendment ? "DIAGNOSIS_AMENDED" : isConfirm ? "DIAGNOSIS_CONFIRMED" : "DIAGNOSIS_UPDATED",
    resourceType: "diagnosis",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DIAGNOSIS_AMEND)) {
    return NextResponse.json({ error: "Forbidden — diagnosis.amend required to delete" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.diagnosis.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const patient = await db.patient.findUnique({ where: { id: existing.patientId } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Soft-delete by setting clinicalStatus=inactive rather than hard delete
  // — preserves audit trail and patient history
  await db.diagnosis.update({
    where: { id },
    data: { clinicalStatus: "inactive", notes: (existing.notes || "") + `\n[Marked inactive by ${session.user.name || "user"} on ${new Date().toISOString()}]` },
  });
  await db.diagnosisStatusHistory.create({
    data: {
      diagnosisId: id,
      fromStatus: existing.clinicalStatus,
      toStatus: "inactive",
      fromVerification: existing.verificationStatus,
      toVerification: existing.verificationStatus,
      changedById: session.user.id,
      changedByName: session.user.name || undefined,
      reason: "Record deleted (soft-delete to inactive)",
    },
  });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "DIAGNOSIS_DELETED",
    resourceType: "diagnosis",
    resourceId: id,
    oldValues: existing,
  });
  return NextResponse.json({ ok: true, deactivated: true });
}
