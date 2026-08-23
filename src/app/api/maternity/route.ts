// =====================================================================
// API: /api/maternity
//   GET  — list maternity records (search + filters)
//   POST — create pregnancy record (with duplicate guard + EDD auto-calc)
//   PATCH — update record (use ?id=xxx query)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Calculate EDD from LMP using Naegele's rule: LMP + 280 days. */
function calcEddFromLmp(lmp: Date): Date {
  return new Date(lmp.getTime() + 280 * MS_PER_DAY);
}

// GET /api/maternity?facilityId=...&patientId=...&status=...&riskLevel=...&search=...&limit=100
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MATERNITY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const patientId = url.searchParams.get("patientId");
  const status = url.searchParams.get("status");
  const riskLevel = url.searchParams.get("riskLevel");
  const search = url.searchParams.get("search")?.trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (patientId) where.patientId = patientId;
  if (status && status !== "all") where.pregnancyStatus = status;
  if (riskLevel && riskLevel !== "all") where.riskLevel = riskLevel;

  if (search) {
    where.OR = [
      {
        patient: {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { patientNumber: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const records = await db.maternityRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      patient: {
        select: {
          id: true, patientNumber: true, firstName: true, lastName: true,
          dateOfBirth: true, sex: true, phone: true,
        },
      },
      facility: { select: { id: true, name: true } },
      encounter: { select: { id: true, encounterNumber: true } },
      newborns: true,
      _count: { select: { ancVisits: true, postnatalVisits: true } },
    },
  });

  return NextResponse.json({ items: records, count: records.length });
}

// POST /api/maternity
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MATERNITY_MANAGE)) {
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
    gravida, para, abortions, livingChildren,
    lmp, eddUltrasound, eddClinical, eddFinal, eddConfidenceReason,
    pregnancyNumber, pregnancyStatus, pregnancyType,
    riskLevel, riskFactors, riskOverrideReason,
    bloodGroup, rhStatus,
    antenatalNotes, deliveryNotes, deliveryDate, deliveryType, birthOutcome,
  } = body;

  if (!patientId || !facilityId) {
    return NextResponse.json({ error: "patientId and facilityId are required" }, { status: 400 });
  }

  // ---- Duplicate pregnancy guard ----
  // Prevent creating a new "active" pregnancy if the patient already has one.
  if (pregnancyStatus === "active" || !pregnancyStatus) {
    const existingActive = await db.maternityRecord.findFirst({
      where: { patientId, pregnancyStatus: "active" },
      select: { id: true },
    });
    if (existingActive) {
      return NextResponse.json(
        {
          error: "Patient already has an active pregnancy. Mark the existing one as delivered/terminated/etc. before creating a new one.",
          code: "DUPLICATE_ACTIVE_PREGNANCY",
          existingRecordId: existingActive.id,
        },
        { status: 409 }
      );
    }
  }

  // ---- EDD auto-calculation from LMP ----
  let computedEddLmp: Date | null = null;
  let computedEddFinal: Date | null = null;
  if (lmp) {
    const lmpDate = new Date(lmp);
    computedEddLmp = calcEddFromLmp(lmpDate);
    // If no explicit eddFinal provided, use LMP-based EDD
    if (!eddFinal && !eddClinical && !eddUltrasound) {
      computedEddFinal = computedEddLmp;
    }
  }
  // If eddFinal is explicitly provided, use it; otherwise prefer clinical > ultrasound > LMP
  if (eddFinal) {
    computedEddFinal = new Date(eddFinal);
  } else if (eddClinical) {
    computedEddFinal = new Date(eddClinical);
  } else if (eddUltrasound) {
    computedEddFinal = new Date(eddUltrasound);
  }

  const record = await db.maternityRecord.create({
    data: {
      patientId,
      encounterId: encounterId || null,
      facilityId,
      gravida: gravida ?? null,
      para: para ?? null,
      abortions: abortions ?? null,
      livingChildren: livingChildren ?? null,
      lmp: lmp ? new Date(lmp) : null,
      eddLmp: computedEddLmp,
      eddUltrasound: eddUltrasound ? new Date(eddUltrasound) : null,
      eddClinical: eddClinical ? new Date(eddClinical) : null,
      eddFinal: computedEddFinal,
      eddConfidenceReason: eddConfidenceReason || null,
      pregnancyNumber: pregnancyNumber ?? null,
      pregnancyStatus: pregnancyStatus || "active",
      pregnancyType: pregnancyType || null,
      riskLevel: riskLevel || "low",
      riskFactors: riskFactors ? JSON.stringify(riskFactors) : null,
      riskOverrideReason: riskOverrideReason || null,
      bloodGroup: bloodGroup || null,
      rhStatus: rhStatus || null,
      antenatalNotes: antenatalNotes || null,
      deliveryNotes: deliveryNotes || null,
      deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
      deliveryType: deliveryType || null,
      birthOutcome: birthOutcome || null,
      createdById: session.user.id,
    },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true } },
      facility: { select: { id: true, name: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "MATERNITY_RECORD_CREATED",
    resourceType: "maternity_record",
    resourceId: record.id,
    newValues: {
      patientId, gravida, para, lmp, eddFinal: computedEddFinal,
      pregnancyStatus, riskLevel, pregnancyType,
    },
  });

  return NextResponse.json({ item: record }, { status: 201 });
}

// PATCH /api/maternity?id=xxx
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MATERNITY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const existing = await db.maternityRecord.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: any = {};
  const fields = [
    "gravida", "para", "abortions", "livingChildren",
    "pregnancyStatus", "pregnancyType",
    "riskLevel", "riskOverrideReason", "bloodGroup", "rhStatus",
    "antenatalNotes", "deliveryNotes", "deliveryType", "birthOutcome",
    "eddConfidenceReason",
  ];
  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f];
  }

  // Date fields
  if (body.lmp !== undefined) {
    data.lmp = body.lmp ? new Date(body.lmp) : null;
    // Recalculate eddLmp if LMP changes
    if (body.lmp) {
      data.eddLmp = calcEddFromLmp(new Date(body.lmp));
    } else {
      data.eddLmp = null;
    }
  }
  if (body.eddUltrasound !== undefined) data.eddUltrasound = body.eddUltrasound ? new Date(body.eddUltrasound) : null;
  if (body.eddClinical !== undefined) data.eddClinical = body.eddClinical ? new Date(body.eddClinical) : null;
  if (body.eddFinal !== undefined) data.eddFinal = body.eddFinal ? new Date(body.eddFinal) : null;
  if (body.deliveryDate !== undefined) data.deliveryDate = body.deliveryDate ? new Date(body.deliveryDate) : null;
  if (body.riskFactors !== undefined) data.riskFactors = body.riskFactors ? JSON.stringify(body.riskFactors) : null;

  const updated = await db.maternityRecord.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "MATERNITY_RECORD_UPDATED",
    resourceType: "maternity_record",
    resourceId: id,
    oldValues: { pregnancyStatus: existing.pregnancyStatus, riskLevel: existing.riskLevel, eddFinal: existing.eddFinal },
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}
