// =====================================================================
// API: /api/procedures/[id]
//   GET    — single procedure
//   PATCH  — update fields OR transition status via action=transition
//            action=transition: { to: <status>, ...optional fields }
//   DELETE — soft delete (sets status=cancelled)
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
  if (!hasPermission(session, PERMISSIONS.PROCEDURE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const procedure = await db.procedure.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true } },
      encounter: { select: { id: true, encounterNumber: true, encounterType: true } },
      facility: { select: { id: true, name: true, code: true } },
      performedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!procedure) return NextResponse.json({ error: "Procedure not found" }, { status: 404 });
  return NextResponse.json({ item: procedure });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCEDURE_PERFORM)) {
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

  const existing = await db.procedure.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Procedure not found" }, { status: 404 });

  // ---- TRANSITION action — change status with optional fields ----
  if (body.action === "transition") {
    const { to, scheduledAt, procedureRoom, performedById, performedAt, findings, outcome, complications, specimensSent, consumablesUsed, followUpInstructions, consentStatus, consentNotes, notes, cancellationReason } = body;

    const validTransitions: Record<string, string[]> = {
      requested: ["scheduled", "confirmed", "patient_ready", "in_progress", "completed", "cancelled", "aborted"],
      scheduled: ["confirmed", "patient_ready", "in_progress", "completed", "cancelled", "rescheduled", "no_show", "aborted"],
      confirmed: ["patient_ready", "in_progress", "completed", "cancelled", "rescheduled", "no_show", "aborted"],
      patient_ready: ["in_progress", "completed", "cancelled", "no_show", "aborted"],
      in_progress: ["completed", "aborted"],
      rescheduled: ["scheduled", "confirmed", "cancelled"],
    };
    const allowed = validTransitions[existing.status] || [];
    if (!allowed.includes(to)) {
      return NextResponse.json(
        { error: `Invalid transition from "${existing.status}" to "${to}". Allowed: ${allowed.join(", ") || "none"}` },
        { status: 400 },
      );
    }

    const updateData: any = { status: to };
    // Capture transition-specific fields
    if (to === "scheduled") {
      if (scheduledAt) updateData.scheduledAt = new Date(scheduledAt);
      if (procedureRoom) updateData.procedureRoom = procedureRoom;
      updateData.scheduledById = session.user.id;
    }
    if (to === "in_progress" && performedById) {
      updateData.performedById = performedById;
    }
    if (to === "completed") {
      if (performedAt) updateData.performedAt = new Date(performedAt);
      else if (!existing.performedAt) updateData.performedAt = new Date();
      if (performedById) updateData.performedById = performedById;
      if (findings !== undefined) updateData.findings = findings || null;
      if (outcome !== undefined) updateData.outcome = outcome || null;
      if (complications !== undefined) updateData.complications = complications || null;
      if (specimensSent !== undefined) updateData.specimensSent = specimensSent || null;
      if (consumablesUsed !== undefined) updateData.consumablesUsed = consumablesUsed || null;
      if (followUpInstructions !== undefined) updateData.followUpInstructions = followUpInstructions || null;
      if (consentStatus !== undefined) updateData.consentStatus = consentStatus;
      if (consentNotes !== undefined) updateData.consentNotes = consentNotes || null;
      if (notes !== undefined) updateData.notes = notes || null;
    }
    if (to === "cancelled") {
      updateData.cancelledAt = new Date();
      updateData.cancelledById = session.user.id;
      if (cancellationReason) updateData.cancellationReason = cancellationReason;
    }

    const updated = await db.procedure.update({ where: { id }, data: updateData });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.facilityId,
      action: `PROCEDURE_${to.toUpperCase()}`,
      resourceType: "procedure",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: updateData,
    });

    return NextResponse.json({ item: updated });
  }

  // ---- Default: update fields ----
  const {
    procedureName, procedureCode, category, performedById, performedAt,
    indication, diagnosisRef, preProcedureNotes,
    findings, outcome, complications, specimensSent, consumablesUsed,
    followUpInstructions, consentStatus, consentNotes, notes,
    scheduledAt, procedureRoom, serviceId, status,
  } = body;

  const data: any = {};
  if (procedureName !== undefined) data.procedureName = procedureName;
  if (procedureCode !== undefined) data.procedureCode = procedureCode || null;
  if (category !== undefined) data.category = category || null;
  if (performedById !== undefined) data.performedById = performedById || null;
  if (performedAt !== undefined) data.performedAt = performedAt ? new Date(performedAt) : null;
  if (indication !== undefined) data.indication = indication || null;
  if (diagnosisRef !== undefined) data.diagnosisRef = diagnosisRef || null;
  if (preProcedureNotes !== undefined) data.preProcedureNotes = preProcedureNotes || null;
  if (findings !== undefined) data.findings = findings || null;
  if (outcome !== undefined) data.outcome = outcome || null;
  if (complications !== undefined) data.complications = complications || null;
  if (specimensSent !== undefined) data.specimensSent = specimensSent || null;
  if (consumablesUsed !== undefined) data.consumablesUsed = consumablesUsed || null;
  if (followUpInstructions !== undefined) data.followUpInstructions = followUpInstructions || null;
  if (consentStatus !== undefined) data.consentStatus = consentStatus;
  if (consentNotes !== undefined) data.consentNotes = consentNotes || null;
  if (notes !== undefined) data.notes = notes || null;
  if (scheduledAt !== undefined) data.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
  if (procedureRoom !== undefined) data.procedureRoom = procedureRoom || null;
  if (serviceId !== undefined) data.serviceId = serviceId || null;
  if (status !== undefined) data.status = status;

  const updated = await db.procedure.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "PROCEDURE_UPDATED",
    resourceType: "procedure",
    resourceId: id,
    oldValues: {
      procedureName: existing.procedureName,
      findings: existing.findings,
      outcome: existing.outcome,
      notes: existing.notes,
    },
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCEDURE_PERFORM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.procedure.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Procedure not found" }, { status: 404 });

  // Soft delete — set status to cancelled
  const updated = await db.procedure.update({
    where: { id },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledById: session.user.id,
      cancellationReason: "Soft-deleted via admin UI",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "PROCEDURE_CANCELLED",
    resourceType: "procedure",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: { status: "cancelled" },
  });

  return NextResponse.json({ item: updated });
}
