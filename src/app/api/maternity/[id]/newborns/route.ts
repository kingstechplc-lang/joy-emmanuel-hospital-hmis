// =====================================================================
// API: /api/maternity/[id]/newborns
//   GET  — list newborns for a pregnancy/delivery
//   POST — create a newborn record
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { notifyNewbornRecorded } from "@/lib/workflow-notifications";

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

  // 🔔 Fire workflow notification
  const mother = await db.patient.findUnique({
    where: { id: maternity.patientId },
    select: { firstName: true, lastName: true },
  });
  await notifyNewbornRecorded({
    organizationId: session.user.organizationId,
    facilityId: maternity.facilityId,
    motherName: mother ? `${mother.firstName} ${mother.lastName}` : "Unknown",
    babySex: sex,
    birthWeight,
    apgar1,
    apgar5,
    newbornId: newborn.id,
    maternityRecordId: id,
    recordedById: session.user.id,
  });

  // 📋 Auto-schedule birth-dose immunizations (BCG, OPV-0, HepB-0)
  // These are scheduled (not administered) — clinical staff must verify
  // and administer them. Uses the existing Immunization module.
  try {
    const birthDoseVaccines = await db.vaccineCatalog.findMany({
      where: {
        organizationId: session.user.organizationId,
        isActive: true,
        scheduleDoses: {
          some: { ageAtDueDays: 0, isActive: true }, // Birth-dose vaccines
        },
      },
      select: { id: true, code: true, name: true, scheduleDoses: { where: { ageAtDueDays: 0 }, select: { doseNumber: true, doseLabel: true } } },
    });

    for (const vaccine of birthDoseVaccines) {
      const dose = vaccine.scheduleDoses[0];
      if (!dose) continue;
      // Check if already scheduled/administered for this newborn
      // (uses motherPatientId since newborn may not have its own Patient record yet)
      const existing = await db.immunization.findFirst({
        where: {
          patientId: maternity.patientId, // Temporarily linked to mother; will be re-linked when newborn gets own Patient record
          vaccineCatalogId: vaccine.id,
          doseNumber: dose.doseNumber,
          status: { in: ["scheduled", "completed"] },
        },
      });
      if (existing) continue; // Don't duplicate

      await db.immunization.create({
        data: {
          patientId: maternity.patientId, // Linked to mother until newborn gets own Patient record
          vaccineCatalogId: vaccine.id,
          vaccineName: vaccine.name,
          dose: dose.doseLabel,
          doseNumber: dose.doseNumber,
          status: "scheduled", // Scheduled — NOT administered. Staff must verify and administer.
          indication: "routine",
          facilityId: maternity.facilityId,
          administeredById: session.user.id,
          notes: `Auto-scheduled at birth for newborn of ${mother?.firstName || ""} ${mother?.lastName || ""}. Newborn record: ${newborn.id}. Verify and administer.`,
        },
      });
    }
  } catch (e) {
    // Immunization auto-scheduling is best-effort — don't fail the newborn
    // creation if the vaccine catalog isn't set up yet.
    console.error("Newborn immunization auto-scheduling failed:", e);
  }

  return NextResponse.json({ item: newborn }, { status: 201 });
}
