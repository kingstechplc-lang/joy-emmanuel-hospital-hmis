// =====================================================================
// API: /api/procedures/[id]
//   GET   — single procedure
//   PATCH — update findings/outcome/notes
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
  const { procedureName, procedureCode, performedById, performedAt, indication, findings, outcome, notes, consentStatus } = body;

  const existing = await db.procedure.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Procedure not found" }, { status: 404 });

  const data: any = {};
  if (procedureName) data.procedureName = procedureName;
  if (procedureCode !== undefined) data.procedureCode = procedureCode || null;
  if (performedById) data.performedById = performedById;
  if (performedAt) data.performedAt = new Date(performedAt);
  if (indication !== undefined) data.indication = indication || null;
  if (findings !== undefined) data.findings = findings || null;
  if (outcome !== undefined) data.outcome = outcome || null;

  // Preserve/update consent status prefix
  if (notes !== undefined || consentStatus !== undefined) {
    const oldNotes = existing.notes || "";
    const consentMatch = oldNotes.match(/^CONSENT: (taken|not_taken)\n?/i);
    const existingConsent = consentMatch ? consentMatch[1].toLowerCase() : null;
    const newConsent = consentStatus === "taken" || consentStatus === "not_taken" ? consentStatus : existingConsent;
    const consentLine = newConsent ? `CONSENT: ${newConsent}\n` : "";
    const notesBody = notes !== undefined ? (notes || "") : oldNotes.replace(/^CONSENT: (taken|not_taken)\n?/i, "");
    data.notes = (consentLine + notesBody).trim() || null;
  }

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
  const updated = await db.procedure.update({ where: { id }, data: { status: "cancelled" } });

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
