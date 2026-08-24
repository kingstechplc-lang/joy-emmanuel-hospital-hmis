// =====================================================================
// API: /api/prescriptions
//   GET  — list prescriptions (facility-scoped, optional patient/status)
//   POST — create new prescription (transactional: Rx + items)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextPrescriptionNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { notifyPrescriptionCreated } from "@/lib/workflow-notifications";

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

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
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
    include: {
      allergies: { where: { status: "active" }, select: { allergen: true, severity: true, reaction: true } },
    },
  });
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const encounter = await db.encounter.findFirst({
    where: { id: encounterId, patientId, facilityId },
  });
  if (!encounter) return NextResponse.json({ error: "Encounter not found for this patient/facility" }, { status: 404 });

  // --- Allergy check ---
  const allergyWarnings: string[] = [];
  for (const item of items) {
    if (!item.medicationId) continue;
    const med = await db.medication.findUnique({ where: { id: item.medicationId }, select: { genericName: true, brandName: true } });
    if (!med) continue;
    const medNameLower = (med.genericName + " " + (med.brandName || "")).toLowerCase();
    for (const allergy of patient.allergies) {
      if (allergy.allergen && medNameLower.includes(allergy.allergen.toLowerCase())) {
        allergyWarnings.push(`ALLERGY ALERT: ${med.genericName} conflicts with documented allergy to ${allergy.allergen}${allergy.severity ? ` (${allergy.severity})` : ""}${allergy.reaction ? ` — Reaction: ${allergy.reaction}` : ""}`);
      }
    }
  }

  // --- Duplicate medication detection ---
  const duplicateWarnings: string[] = [];
  const activeRxItems = await db.prescriptionItem.findMany({
    where: {
      prescription: { patientId, status: { in: ["pending", "approved", "partially_dispensed"] } },
      status: { in: ["pending", "partially_dispensed"] },
    },
    include: { medication: { select: { genericName: true, brandName: true } } },
  });
  for (const item of items) {
    if (!item.medicationId) continue;
    const dup = activeRxItems.find((a) => a.medicationId === item.medicationId);
    if (dup) {
      const medName = dup.medication.genericName + (dup.medication.brandName ? ` (${dup.medication.brandName})` : "");
      duplicateWarnings.push(`DUPLICATE: Patient already has an active prescription for ${medName} (Rx item ID: ${dup.id})`);
    }
  }

  // --- Drug-drug interaction check ---
  const interactionWarnings: string[] = [];
  const newMedIds = items.filter((it: any) => it.medicationId).map((it: any) => it.medicationId);
  const allMedIds = [...new Set([...newMedIds, ...activeRxItems.map((a) => a.medicationId)])];

  if (allMedIds.length >= 2) {
    // Load all medications with their therapeutic classes
    const allMeds = await db.medication.findMany({
      where: { id: { in: allMedIds } },
      select: { id: true, genericName: true, therapeuticClass: true },
    });
    const medMap = new Map(allMeds.map((m) => [m.id, m]));
    const allClasses = new Set(
      [...allMeds.map((m) => m.therapeuticClass)].filter(Boolean) as string[]
    );

    // Load all active interaction rules for this org
    const interactionRules = await db.medicationInteraction.findMany({
      where: { organizationId: session.user.organizationId, isActive: true },
    });

    for (const rule of interactionRules) {
      let matchA = false;
      let matchB = false;
      let medAName = "";
      let medBName = "";

      // Check medication A
      if (rule.medicationAId) {
        if (allMedIds.includes(rule.medicationAId)) {
          matchA = true;
          medAName = medMap.get(rule.medicationAId)?.genericName || "Unknown";
        }
      } else if (rule.therapeuticClassA && allClasses.has(rule.therapeuticClassA)) {
        matchA = true;
        medAName = rule.therapeuticClassA;
      }

      // Check medication B
      if (rule.medicationBId) {
        if (allMedIds.includes(rule.medicationBId)) {
          matchB = true;
          medBName = medMap.get(rule.medicationBId)?.genericName || "Unknown";
        }
      } else if (rule.therapeuticClassB && allClasses.has(rule.therapeuticClassB)) {
        matchB = true;
        medBName = rule.therapeuticClassB;
      }

      if (matchA && matchB) {
        const severityIcon =
          rule.severity === "contraindicated" ? "🚫 CONTRAINDICATED"
          : rule.severity === "severe" ? "⚠️ SEVERE INTERACTION"
          : rule.severity === "moderate" ? "⚡ MODERATE INTERACTION"
          : "ℹ️ MILD INTERACTION";
        interactionWarnings.push(
          `${severityIcon}: ${medAName} + ${medBName} — ${rule.description}${rule.clinicalAdvice ? ` | Advice: ${rule.clinicalAdvice}` : ""}`
        );
      }
    }
  }

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
        allergyWarnings: allergyWarnings.length > 0 ? JSON.stringify(allergyWarnings) : null,
        duplicateWarnings: duplicateWarnings.length > 0 ? JSON.stringify(duplicateWarnings) : null,
        interactionWarnings: interactionWarnings.length > 0 ? JSON.stringify(interactionWarnings) : null,
        warningsAcknowledged: body.acknowledgeWarnings === true,
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
          durationValue: it.durationValue ? parseInt(it.durationValue) : null,
          durationUnit: it.durationUnit || null,
          quantity: Number(it.quantity) || 0,
          quantityCalculated: it.quantityCalculated || false,
          instructions: it.instructions || null,
          isPRN: it.isPRN || false,
          prnIndication: it.prnIndication || null,
          prnMaxFrequency: it.prnMaxFrequency || null,
          isSTAT: it.isSTAT || false,
          isOneTime: it.isOneTime || false,
          startDate: it.startDate ? new Date(it.startDate) : null,
          endDate: it.endDate ? new Date(it.endDate) : null,
          diagnosisId: it.diagnosisId || null,
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

  // 🔔 Fire workflow notification to pharmacy staff
  const patForNotif = await db.patient.findUnique({
    where: { id: patientId },
    select: { firstName: true, lastName: true },
  });
  await notifyPrescriptionCreated({
    organizationId: session.user.organizationId,
    facilityId,
    prescriptionNumber,
    patientName: patForNotif ? `${patForNotif.firstName} ${patForNotif.lastName}` : "Unknown",
    itemCount: items.length,
    prescriberId: session.user.id,
    prescriptionId: prescription.id,
  });

  return NextResponse.json({ item: prescription }, { status: 201 });
}
