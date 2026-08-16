// =====================================================================
// API: /api/prescriptions
//   GET  — list prescriptions (facility-scoped, optional patient/status)
//   POST — create new prescription (transactional: Rx + items)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextPrescriptionNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/prescriptions?facilityId=...&patientId=...&status=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PHARMACY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const patientId = url.searchParams.get("patientId") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const prescriberId = url.searchParams.get("prescriberId") || undefined;

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (patientId) where.patientId = patientId;
  if (status && status !== "all") where.status = status;
  if (prescriberId) where.prescriberId = prescriberId;

  // For pharmacists viewing the dispense queue, only pending/approved/partially_dispensed
  const dispenseQueue = url.searchParams.get("dispenseQueue") === "true";
  if (dispenseQueue) {
    where.status = { in: ["pending", "approved", "partially_dispensed"] };
  }

  const prescriptions = await db.prescription.findMany({
    where,
    orderBy: { prescribedAt: "desc" },
    take: 200,
    include: {
      patient: {
        select: {
          id: true, patientNumber: true, firstName: true, lastName: true,
          dateOfBirth: true, sex: true, phone: true, bloodGroup: true,
        },
      },
      prescriber: { select: { id: true, firstName: true, lastName: true } },
      encounter: { select: { id: true, encounterNumber: true, encounterType: true } },
      facility: { select: { id: true, name: true, code: true } },
      items: {
        include: {
          medication: { select: { id: true, genericName: true, brandName: true, strength: true, dosageForm: true, route: true } },
        },
      },
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json({ items: prescriptions, count: prescriptions.length });
}

// POST /api/prescriptions
// Body: { patientId, encounterId, facilityId, prescriberId?, notes?, items: [{ medicationId, dose, frequency, route, duration, quantity, instructions }] }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PHARMACY_PRESCRIBE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { patientId, encounterId, facilityId, prescriberId, notes, items } = body;

  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  if (!encounterId) return NextResponse.json({ error: "encounterId is required" }, { status: 400 });
  if (!facilityId) return NextResponse.json({ error: "facilityId is required" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "At least one prescription item is required" }, { status: 400 });
  }

  // Validate patient + encounter belong together
  const patient = await db.patient.findFirst({
    where: { id: patientId, organizationId: session.user.organizationId },
  });
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const encounter = await db.encounter.findFirst({
    where: { id: encounterId, patientId, facilityId },
  });
  if (!encounter) return NextResponse.json({ error: "Encounter not found for this patient/facility" }, { status: 404 });

  const prescriptionNumber = await nextPrescriptionNumber(facilityId);

  // Transactional create
  const prescription = await db.$transaction(async (tx) => {
    const rx = await tx.prescription.create({
      data: {
        patientId,
        encounterId,
        facilityId,
        prescriptionNumber,
        prescriberId: prescriberId || session.user.id,
        status: "pending",
        notes: notes || null,
        prescribedAt: new Date(),
      },
    });

    for (const it of items) {
      if (!it.medicationId) continue;
      await tx.prescriptionItem.create({
        data: {
          prescriptionId: rx.id,
          medicationId: it.medicationId,
          dose: it.dose || null,
          frequency: it.frequency || null,
          route: it.route || null,
          duration: it.duration || null,
          quantity: Number(it.quantity) || 0,
          instructions: it.instructions || null,
          dispensedQuantity: 0,
          status: "pending",
        },
      });
    }

    return rx;
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "PRESCRIPTION_CREATED",
    resourceType: "prescription",
    resourceId: prescription.id,
    newValues: {
      prescriptionNumber,
      patientId,
      encounterId,
      itemCount: items.length,
    },
  });

  return NextResponse.json({ item: prescription }, { status: 201 });
}
