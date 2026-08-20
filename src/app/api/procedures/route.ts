// =====================================================================
// API: /api/procedures
//   GET  — list procedures filtered by facility/patientId
//   POST — create a procedure record (procedure.perform permission)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/procedures?facilityId=...&patientId=...&limit=50
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCEDURE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const patientId = url.searchParams.get("patientId");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (patientId) where.patientId = patientId;

  const procedures = await db.procedure.findMany({
    where,
    orderBy: { performedAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true } },
      encounter: { select: { id: true, encounterNumber: true, encounterType: true } },
      facility: { select: { id: true, name: true, code: true } },
      performedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: procedures, count: procedures.length });
}

// POST /api/procedures
// Body: { patientId, encounterId, facilityId, procedureName, procedureCode,
//         performedById, performedAt, indication, findings, outcome, notes, consentStatus }
// NOTE: consentStatus is persisted by prefixing notes with "CONSENT: taken|not_taken\n"
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCEDURE_PERFORM)) {
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
    patientId, encounterId, facilityId,
    procedureName, procedureCode,
    performedById, performedAt,
    indication, findings, outcome, notes,
    consentStatus,
  } = body;

  if (!patientId || !facilityId) {
    return NextResponse.json({ error: "patientId and facilityId are required" }, { status: 400 });
  }
  if (!procedureName) {
    return NextResponse.json({ error: "procedureName is required" }, { status: 400 });
  }

  // Resolve encounter
  let finalEncounterId = encounterId;
  if (!finalEncounterId) {
    const year = new Date().getFullYear();
    const count = await db.encounter.count({ where: { facilityId } });
    const encounterNumber = `ENC-${year}-${String(count + 1).padStart(6, "0")}`;
    const enc = await db.encounter.create({
      data: {
        patientId,
        facilityId,
        encounterNumber,
        encounterType: "procedure",
        status: "in_progress",
        priority: "routine",
        attendingStaffId: session.user.id,
        startAt: new Date(),
        createdById: session.user.id,
      },
    });
    finalEncounterId = enc.id;
  }

  // Prefix notes with consent status so it persists (Procedure schema has no consent_status field)
  const consentLine = consentStatus === "taken" || consentStatus === "not_taken"
    ? `CONSENT: ${consentStatus}\n`
    : "";
  const finalNotes = (consentLine + (notes || "")).trim() || null;

  const procedure = await db.procedure.create({
    data: {
      patientId,
      encounterId: finalEncounterId,
      facilityId,
      procedureCode: procedureCode || null,
      procedureName,
      performedById: performedById || session.user.id,
      performedAt: performedAt ? new Date(performedAt) : new Date(),
      indication: indication || null,
      findings: findings || null,
      outcome: outcome || null,
      notes: finalNotes,
      status: "completed",
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      performedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "PROCEDURE_PERFORMED",
    resourceType: "procedure",
    resourceId: procedure.id,
    newValues: {
      patientId,
      encounterId: finalEncounterId,
      procedureName,
      procedureCode,
      performedById: procedure.performedById,
      performedAt: procedure.performedAt,
      indication,
      outcome,
      consentStatus: consentStatus || null,
    },
  });

  return NextResponse.json({ item: procedure }, { status: 201 });
}
