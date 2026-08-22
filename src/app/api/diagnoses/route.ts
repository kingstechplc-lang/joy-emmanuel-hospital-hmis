// =====================================================================
// API: /api/diagnoses
//   GET  — list diagnoses (filter by patient/encounter/status/type)
//   POST — create a diagnosis linked to a patient + encounter
//          Body can include catalogId to link to the master catalog,
//          OR diagnosisCode + diagnosisName for free-text (snapshot) entries.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/diagnoses?patientId=...&encounterId=...&status=...&type=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DIAGNOSIS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const encounterId = url.searchParams.get("encounterId");
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const chronic = url.searchParams.get("chronic");
  const primary = url.searchParams.get("primary");
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (encounterId) where.encounterId = encounterId;
  if (status) where.clinicalStatus = status;
  if (type) where.diagnosisType = type;
  if (chronic === "true") where.isChronic = true;
  if (primary === "true") where.isPrimary = true;

  const diagnoses = await db.diagnosis.findMany({
    where,
    orderBy: [{ isPrimary: "desc" }, { diagnosedAt: "desc" }],
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } },
      encounter: {
        select: {
          id: true, encounterNumber: true, encounterType: true,
          facility: { select: { id: true, name: true } },
          department: { select: { id: true, name: true, code: true } },
        },
      },
      catalog: { select: { id: true, code: true, name: true, codeSystem: true, category: true, isChronicDefault: true } },
      statusHistory: { orderBy: { changedAt: "desc" }, take: 10 },
    },
  });

  return NextResponse.json({ items: diagnoses, count: diagnoses.length });
}

// POST /api/diagnoses
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DIAGNOSIS_CREATE)) {
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
    patientId, encounterId, catalogId,
    diagnosisCode, diagnosisName, codeSystem,
    diagnosisType, clinicalStatus, verificationStatus,
    isPrimary, isChronic, onsetDate, notes,
  } = body;

  if (!patientId || !encounterId || !diagnosisName) {
    return NextResponse.json({ error: "patientId, encounterId and diagnosisName are required" }, { status: 400 });
  }

  // Validate patient + encounter belong to user's org
  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  const encounter = await db.encounter.findUnique({ where: { id: encounterId } });
  if (!encounter || encounter.patientId !== patientId) {
    return NextResponse.json({ error: "Encounter not found or does not match patient" }, { status: 404 });
  }

  // Validate catalog entry if provided
  let catalogEntry: any = null;
  if (catalogId) {
    catalogEntry = await db.diagnosisCatalog.findUnique({ where: { id: catalogId } });
    if (!catalogEntry || catalogEntry.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Catalog entry not found" }, { status: 404 });
    }
  }

  // Duplicate prevention — same catalogId OR same diagnosisCode in same encounter
  const dupWhere: any = { encounterId };
  if (catalogId) {
    dupWhere.catalogId = catalogId;
  } else if (diagnosisCode) {
    dupWhere.diagnosisCode = diagnosisCode;
  } else {
    dupWhere.diagnosisName = diagnosisName;
    dupWhere.diagnosisCode = null;
  }
  const existing = await db.diagnosis.findFirst({ where: dupWhere });
  if (existing) {
    return NextResponse.json({
      error: "Duplicate diagnosis",
      detail: `This diagnosis is already recorded for this encounter (type: ${existing.diagnosisType}, status: ${existing.clinicalStatus}).`,
      existingId: existing.id,
    }, { status: 409 });
  }

  // If isPrimary=true, demote any existing primary for this encounter
  const finalIsPrimary = isPrimary || diagnosisType === "primary";
  if (finalIsPrimary) {
    await db.diagnosis.updateMany({
      where: { encounterId, isPrimary: true },
      data: { isPrimary: false, diagnosisType: "secondary" },
    });
  }

  // Determine chronic flag
  const finalIsChronic = isChronic ?? catalogEntry?.isChronicDefault ?? false;

  // Snapshot code + name from catalog if not explicitly provided
  const finalCode = diagnosisCode || catalogEntry?.code || null;
  const finalName = diagnosisName || catalogEntry?.name;
  const finalCodeSystem = codeSystem || catalogEntry?.codeSystem || "ICD-10";

  const diagnosis = await db.diagnosis.create({
    data: {
      patientId,
      encounterId,
      catalogId: catalogId || null,
      diagnosisCode: finalCode,
      codeSystem: finalCodeSystem,
      diagnosisName: finalName,
      diagnosisType: diagnosisType || (finalIsPrimary ? "primary" : "secondary"),
      clinicalStatus: clinicalStatus || "active",
      verificationStatus: verificationStatus || (diagnosisType === "provisional" ? "provisional" : "confirmed"),
      isPrimary: finalIsPrimary,
      isChronic: finalIsChronic,
      onsetDate: onsetDate ? new Date(onsetDate) : null,
      diagnosedById: session.user.id,
      notes: notes || null,
    },
  });

  // Initial status history entry
  await db.diagnosisStatusHistory.create({
    data: {
      diagnosisId: diagnosis.id,
      toStatus: diagnosis.clinicalStatus,
      toVerification: diagnosis.verificationStatus,
      changedById: session.user.id,
      changedByName: session.user.name || undefined,
      reason: "Initial recording",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: encounter.facilityId || undefined,
    action: "DIAGNOSIS_CREATED",
    resourceType: "diagnosis",
    resourceId: diagnosis.id,
    newValues: { patientId, encounterId, diagnosisName: finalName, diagnosisType: diagnosis.diagnosisType, isPrimary: finalIsPrimary },
  });

  return NextResponse.json({ item: diagnosis }, { status: 201 });
}
