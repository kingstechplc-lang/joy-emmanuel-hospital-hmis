// =====================================================================
// API: /api/maternity
//   GET  — list maternity records (filter by facility/patient)
//   POST — create maternity record
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/maternity?facilityId=...&patientId=...&limit=50
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MATERNITY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const patientId = url.searchParams.get("patientId");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (patientId) where.patientId = patientId;

  const records = await db.maternityRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true } },
      facility: { select: { id: true, name: true } },
      encounter: { select: { id: true, encounterNumber: true } },
      newborns: true,
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

  const body = await req.json();
  const {
    patientId, encounterId, facilityId,
    gravida, para, expectedDeliveryDate, pregnancyStatus,
    antenatalNotes, deliveryNotes, deliveryDate, deliveryType, birthOutcome,
  } = body;

  if (!patientId || !facilityId) {
    return NextResponse.json({ error: "patientId and facilityId are required" }, { status: 400 });
  }

  const record = await db.maternityRecord.create({
    data: {
      patientId,
      encounterId: encounterId || null,
      facilityId,
      gravida: gravida ?? null,
      para: para ?? null,
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      pregnancyStatus: pregnancyStatus || "active",
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
    newValues: { patientId, gravida, para, expectedDeliveryDate },
  });

  return NextResponse.json({ item: record }, { status: 201 });
}

// PATCH /api/maternity — update record (use ?id=xxx query)
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MATERNITY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  const body = await req.json();
  const existing = await db.maternityRecord.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: any = {};
  const fields = [
    "gravida", "para", "pregnancyStatus", "antenatalNotes",
    "deliveryNotes", "deliveryType", "birthOutcome",
  ];
  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  if (body.expectedDeliveryDate) data.expectedDeliveryDate = new Date(body.expectedDeliveryDate);
  if (body.deliveryDate) data.deliveryDate = new Date(body.deliveryDate);

  const updated = await db.maternityRecord.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "MATERNITY_RECORD_UPDATED",
    resourceType: "maternity_record",
    resourceId: id,
    oldValues: existing,
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}
