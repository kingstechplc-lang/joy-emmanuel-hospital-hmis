// =====================================================================
// API: /api/procedures
//   GET  — list procedures filtered by facility/patientId/status/category
//   POST — create a procedure request (procedure.perform permission)
//          Now supports: catalog linkage, scheduling, full documentation,
//          consent as a dedicated field, status state machine starting at "requested"
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/procedures?facilityId=...&patientId=...&status=...&category=...&limit=50
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCEDURE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const patientId = url.searchParams.get("patientId");
  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");
  const search = (url.searchParams.get("search") || "").trim();
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (patientId) where.patientId = patientId;
  if (status) where.status = status;
  if (category) where.category = category;
  if (search) {
    where.OR = [
      { procedureName: { contains: search, mode: "insensitive" } },
      { procedureCode: { contains: search, mode: "insensitive" } },
      { patient: { firstName: { contains: search, mode: "insensitive" } } },
      { patient: { lastName: { contains: search, mode: "insensitive" } } },
      { patient: { patientNumber: { contains: search, mode: "insensitive" } } },
    ];
  }

  const procedures = await db.procedure.findMany({
    where,
    orderBy: { createdAt: "desc" },
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
// Body: { patientId, encounterId, facilityId, procedureCatalogId?, procedureName, procedureCode?,
//         category?, requestedById?, requestedAt?, scheduledAt?, procedureRoom?,
//         indication, diagnosisRef?, preProcedureNotes?,
//         performedById?, performedAt?,
//         findings?, outcome?, complications?, specimensSent?, consumablesUsed?,
//         followUpInstructions?, consentStatus, consentNotes?, notes?, serviceId?,
//         status? (default: "requested") }
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
    procedureCatalogId, procedureName, procedureCode, category,
    requestedById, requestedAt, scheduledAt, procedureRoom,
    indication, diagnosisRef, preProcedureNotes,
    performedById, performedAt,
    findings, outcome, complications, specimensSent, consumablesUsed,
    followUpInstructions, consentStatus, consentNotes, notes,
    serviceId, priority,
  } = body;

  if (!patientId || !facilityId) {
    return NextResponse.json({ error: "patientId and facilityId are required" }, { status: 400 });
  }
  if (!procedureName && !procedureCatalogId) {
    return NextResponse.json({ error: "procedureName or procedureCatalogId is required" }, { status: 400 });
  }

  // If catalog ID provided, fetch the catalog entry to inherit fields
  let catalog: any = null;
  let finalName = procedureName;
  let finalCode = procedureCode;
  let finalCategory = category;
  let finalServiceId = serviceId;
  if (procedureCatalogId) {
    catalog = await db.procedureCatalog.findUnique({ where: { id: procedureCatalogId } });
    if (catalog) {
      finalName = finalName || catalog.name;
      finalCode = finalCode || catalog.code;
      finalCategory = finalCategory || catalog.category;
      finalServiceId = finalServiceId || catalog.serviceId;
    }
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
        priority: priority || "routine",
        attendingStaffId: session.user.id,
        startAt: new Date(),
        createdById: session.user.id,
      },
    });
    finalEncounterId = enc.id;
  }

  // Determine initial status: if performedAt is provided, status is "completed"; otherwise "requested"
  const initialStatus = performedAt ? "completed" : (body.status || "requested");

  const procedure = await db.procedure.create({
    data: {
      patientId,
      encounterId: finalEncounterId,
      facilityId,
      procedureCatalogId: procedureCatalogId || null,
      procedureCode: finalCode || null,
      procedureName: finalName,
      category: finalCategory || null,
      requestedById: requestedById || session.user.id,
      requestedAt: requestedAt ? new Date(requestedAt) : new Date(),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      scheduledById: scheduledAt ? session.user.id : null,
      procedureRoom: procedureRoom || null,
      performedById: performedById || null,
      performedAt: performedAt ? new Date(performedAt) : null,
      indication: indication || null,
      diagnosisRef: diagnosisRef || null,
      preProcedureNotes: preProcedureNotes || null,
      findings: findings || null,
      outcome: outcome || null,
      complications: complications || null,
      specimensSent: specimensSent || null,
      consumablesUsed: consumablesUsed || null,
      followUpInstructions: followUpInstructions || null,
      consentStatus: consentStatus || "not_taken",
      consentNotes: consentNotes || null,
      notes: notes || null,
      serviceId: finalServiceId || null,
      status: initialStatus,
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
    action: performedAt ? "PROCEDURE_PERFORMED" : "PROCEDURE_REQUESTED",
    resourceType: "procedure",
    resourceId: procedure.id,
    newValues: {
      patientId,
      encounterId: finalEncounterId,
      procedureCatalogId,
      procedureName: procedure.procedureName,
      procedureCode: procedure.procedureCode,
      category: procedure.category,
      indication,
      consentStatus: procedure.consentStatus,
      status: procedure.status,
      scheduledAt,
      serviceId: procedure.serviceId,
    },
  });

  return NextResponse.json({ item: procedure }, { status: 201 });
}
