// =====================================================================
// API: /api/maternity/[id]/labor
//   GET  — get labor & delivery record for a pregnancy
//   POST — create or update labor & delivery record (upsert)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { notifyDeliveryRecorded } from "@/lib/workflow-notifications";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MATERNITY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const labor = await db.laborAndDelivery.findUnique({
    where: { maternityRecordId: id },
    include: {
      attendingClinician: { select: { id: true, firstName: true, lastName: true } },
      attendingMidwife: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ item: labor });
}

// POST /api/maternity/[id]/labor — upsert (create if not exists, update if exists)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MATERNITY_DELIVERY_RECORD)) {
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
    admissionDate, admissionId,
    onsetOfLabor, ruptureOfMembranes, membraneStatus, liquorColor,
    cervicalDilation, effacement, station,
    contractionFreq, contractionDur, contractionStrength,
    fetalHeartRate, fetalHeartRateAbnormal,
    maternalPulse, maternalBpSystolic, maternalBpDiastolic, maternalTemp,
    deliveryDate, deliveryType, deliveryIndication, presentation,
    episiotomy, episiotomyType,
    placentaDelivered, placentaCondition, estimatedBloodLoss,
    oxytocinUsed, ivFluidsGiven, urineOutput,
    maternalComplications, neonatalComplications, maternalOutcome,
    attendingClinicianId, attendingMidwifeId,
    partographData, notes,
  } = body;

  // Build the data object
  const data: any = {
    patientId: maternity.patientId,
    facilityId: maternity.facilityId,
    admissionDate: admissionDate ? new Date(admissionDate) : null,
    admissionId: admissionId || null,
    onsetOfLabor: onsetOfLabor ? new Date(onsetOfLabor) : null,
    ruptureOfMembranes: ruptureOfMembranes ? new Date(ruptureOfMembranes) : null,
    membraneStatus: membraneStatus || null,
    liquorColor: liquorColor || null,
    cervicalDilation: cervicalDilation ?? null,
    effacement: effacement ?? null,
    station: station ?? null,
    contractionFreq: contractionFreq ?? null,
    contractionDur: contractionDur ?? null,
    contractionStrength: contractionStrength || null,
    fetalHeartRate: fetalHeartRate ?? null,
    fetalHeartRateAbnormal: !!fetalHeartRateAbnormal,
    maternalPulse: maternalPulse ?? null,
    maternalBpSystolic: maternalBpSystolic ?? null,
    maternalBpDiastolic: maternalBpDiastolic ?? null,
    maternalTemp: maternalTemp ?? null,
    deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
    deliveryType: deliveryType || null,
    deliveryIndication: deliveryIndication || null,
    presentation: presentation || null,
    episiotomy: !!episiotomy,
    episiotomyType: episiotomyType || null,
    placentaDelivered: !!placentaDelivered,
    placentaCondition: placentaCondition || null,
    estimatedBloodLoss: estimatedBloodLoss ?? null,
    oxytocinUsed: !!oxytocinUsed,
    ivFluidsGiven: ivFluidsGiven || null,
    urineOutput: urineOutput || null,
    maternalComplications: maternalComplications || null,
    neonatalComplications: neonatalComplications || null,
    maternalOutcome: maternalOutcome || null,
    attendingClinicianId: attendingClinicianId || null,
    attendingMidwifeId: attendingMidwifeId || null,
    partographData: partographData ? JSON.stringify(partographData) : null,
    notes: notes || null,
  };

  // Upsert — create if not exists, update if exists
  const labor = await db.laborAndDelivery.upsert({
    where: { maternityRecordId: id },
    create: { maternityRecordId: id, ...data },
    update: data,
    include: {
      attendingClinician: { select: { id: true, firstName: true, lastName: true } },
      attendingMidwife: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // If delivery is recorded, update the MaternityRecord's delivery summary
  if (deliveryDate) {
    await db.maternityRecord.update({
      where: { id },
      data: {
        deliveryDate: new Date(deliveryDate),
        deliveryType: deliveryType || null,
        pregnancyStatus: "delivered",
      },
    });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: maternity.facilityId,
    action: "LABOR_DELIVERY_RECORDED",
    resourceType: "labor_and_delivery",
    resourceId: labor.id,
    newValues: { maternityRecordId: id, deliveryDate, deliveryType, maternalOutcome },
  });

  // 🔔 Fire delivery notification if delivery was recorded
  if (deliveryDate) {
    const patient = await db.patient.findUnique({
      where: { id: maternity.patientId },
      select: { firstName: true, lastName: true },
    });
    const newbornCount = await db.newbornRecord.count({
      where: { deliveryRecordId: id },
    });
    await notifyDeliveryRecorded({
      organizationId: session.user.organizationId,
      facilityId: maternity.facilityId,
      patientName: patient ? `${patient.firstName} ${patient.lastName}` : "Unknown",
      deliveryType,
      deliveryDate,
      birthOutcome: body.birthOutcome,
      newbornCount,
      maternityRecordId: id,
      laborAndDeliveryId: labor.id,
      recordedById: session.user.id,
    });
  }

  return NextResponse.json({ item: labor }, { status: 201 });
}
