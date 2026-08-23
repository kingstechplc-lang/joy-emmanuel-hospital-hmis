// =====================================================================
// API: /api/maternity/[id]/newborns
//   GET  — list newborns for a pregnancy/delivery
//   POST — create a newborn record
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
  if (!hasPermission(session, PERMISSIONS.MATERNITY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const newborns = await db.newbornRecord.findMany({
    where: { deliveryRecordId: id },
    orderBy: { birthDate: "asc" },
  });

  return NextResponse.json({ items: newborns, count: newborns.length });
}

// POST /api/maternity/[id]/newborns
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MATERNITY_NEWBORN_RECORD)) {
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

  const maternity = await db.maternityRecord.findUnique({
    where: { id },
    select: { id: true, patientId: true, facilityId: true },
  });
  if (!maternity) return NextResponse.json({ error: "Maternity record not found" }, { status: 404 });

  const {
    birthDate, sex, birthWeight, birthLength, headCircumference,
    apgar1, apgar5, apgar10, gestationalAge,
    feedingStatus, resuscitation, complications, outcome,
    babyName, attendingStaffId, notes,
  } = body;

  if (!birthDate) {
    return NextResponse.json({ error: "birthDate is required" }, { status: 400 });
  }

  const newborn = await db.newbornRecord.create({
    data: {
      motherPatientId: maternity.patientId,
      deliveryRecordId: id,
      birthDate: new Date(birthDate),
      sex: sex || null,
      birthWeight: birthWeight || null,
      birthLength: birthLength || null,
      headCircumference: headCircumference || null,
      apgar1: apgar1 || null,
      apgar5: apgar5 || null,
      apgar10: apgar10 || null,
      gestationalAge: gestationalAge || null,
      feedingStatus: feedingStatus || null,
      resuscitation: resuscitation || null,
      complications: complications || null,
      outcome: outcome || null,
      babyName: babyName || null,
      attendingStaffId: attendingStaffId || null,
      notes: notes || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: maternity.facilityId,
    action: "NEWBORN_RECORD_CREATED",
    resourceType: "newborn_record",
    resourceId: newborn.id,
    newValues: { deliveryRecordId: id, sex, birthWeight, apgar1, apgar5 },
  });

  return NextResponse.json({ item: newborn }, { status: 201 });
}
