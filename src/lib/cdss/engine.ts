// =====================================================================
// CDSS ENGINE — Clinical Decision Support System
// =====================================================================
// Central rule-based safety evaluation that unifies:
//   A. Drug-allergy interaction alerts
//   B. Drug-drug interaction checking
//   C. Critical laboratory result alerts
//   D. Abnormal vital-sign alerts
//
// This is NOT a diagnostic AI. It is a rule-based safety support layer
// that assists (not replaces) the clinician. It never:
//   - Autonomously diagnoses
//   - Autonomously prescribes
//   - Changes prescriptions
//   - Cancels medications
//   - Alters lab results
//   - Overrides clinicians
//
// All alerts are auditable, lifecycle-managed, and deduplicatable.
// The CDSS distinguishes "no alert found" from "check failed" (per spec §21).
// =====================================================================

import { db } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────────────────

export type AlertType =
  | "drug_allergy"
  | "drug_drug_interaction"
  | "therapeutic_duplication"
  | "critical_lab"
  | "abnormal_vital";

export type AlertSeverity = "info" | "low" | "moderate" | "high" | "critical";

export type AlertStatus =
  | "active"
  | "acknowledged"
  | "dismissed"
  | "overridden"
  | "resolved"
  | "escalated"
  | "expired";

export interface CDSSAlert {
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  sourceType?: string;
  sourceId?: string;
  ruleId?: string;
  evidence?: Record<string, any>;
  recommendation?: string;
  deduplicationKey: string;
}

export interface CDSSCheckResult {
  alerts: CDSSAlert[];
  checkCompleted: boolean;
  checkError?: string;
}

// ─── A. Drug-Allergy Check ───────────────────────────────────────────
//
// Checks a medication against the patient's documented allergies.
// Uses exact name matching + generic name matching (per spec §7).
// Does NOT invent cross-reactivity (per spec §69).
// =====================================================================

export async function checkDrugAllergy(
  patientId: string,
  medicationName: string,
  medicationGenericName?: string,
): Promise<CDSSAlert[]> {
  const allergies = await db.allergy.findMany({
    where: {
      patientId,
      status: { in: ["active", undefined, null] },
    },
    select: { id: true, allergen: true, reaction: true, severity: true },
  });

  const alerts: CDSSAlert[] = [];
  const medLower = medicationName.toLowerCase().trim();
  const genericLower = (medicationGenericName || "").toLowerCase().trim();

  for (const allergy of allergies) {
    const allergenLower = allergy.allergen.toLowerCase().trim();
    if (!allergenLower) continue;

    // Match: medication name contains allergen, OR allergen contains medication name,
    // OR generic name contains allergen, OR allergen contains generic name.
    const matches =
      medLower.includes(allergenLower) ||
      allergenLower.includes(medLower) ||
      (genericLower && genericLower.includes(allergenLower)) ||
      (genericLower && allergenLower.includes(genericLower));

    if (!matches) continue;

    const severity: AlertSeverity =
      allergy.severity === "anaphylactic" ? "critical" :
      allergy.severity === "severe" ? "high" :
      allergy.severity === "moderate" ? "moderate" : "low";

    alerts.push({
      alertType: "drug_allergy",
      severity,
      title: "Medication Safety Alert — Documented Allergy",
      message: `The selected medication "${medicationName}" may conflict with the patient's documented allergy to "${allergy.allergen}".${allergy.reaction ? ` Recorded reaction: ${allergy.reaction}.` : ""}`,
      sourceType: "prescription",
      ruleId: "drug-allergy-name-match",
      evidence: {
        medicationName,
        medicationGenericName: medicationGenericName || null,
        allergen: allergy.allergen,
        reaction: allergy.reaction || null,
        allergySeverity: allergy.severity || null,
        allergyId: allergy.id,
      },
      recommendation: `Review the allergy record and consider an alternative medication. If this medication is clinically necessary, override with a documented reason.`,
      deduplicationKey: `drug_allergy:${patientId}:${allergy.id}:${medicationName}`,
    });
  }

  return alerts;
}

// ─── B. Drug-Drug Interaction Check ──────────────────────────────────
//
// Reuses the existing MedicationInteraction model.
// Checks the new medication against the patient's active prescriptions.
// =====================================================================

export async function checkDrugDrugInteractions(
  patientId: string,
  newMedicationId: string,
  newMedicationGenericName?: string,
  newMedicationTherapeuticClass?: string,
  organizationId: string,
): Promise<CDSSAlert[]> {
  // Fetch the patient's active prescription items (medications)
  const activeItems = await db.prescriptionItem.findMany({
    where: {
      prescription: { patientId, status: { in: ["pending", "approved", "partially_dispensed"] } },
      status: { notIn: ["cancelled", "discontinued"] },
    },
    include: {
      medication: { select: { id: true, genericName: true, therapeuticClass: true, brandName: true } },
      prescription: { select: { id: true, prescriptionNumber: true } },
    },
  });

  if (activeItems.length === 0) return [];

  // Fetch all active interaction rules for the org
  const rules = await db.medicationInteraction.findMany({
    where: { organizationId, isActive: true },
  });

  const alerts: CDSSAlert[] = [];
  const newMedLower = (newMedicationGenericName || "").toLowerCase();

  for (const item of activeItems) {
    if (!item.medication) continue;
    if (item.medication.id === newMedicationId) continue; // skip self

    const activeMedId = item.medication.id;
    const activeGeneric = (item.medication.genericName || "").toLowerCase();
    const activeClass = item.medication.therapeuticClass || "";

    // Check by medication ID pairs
    for (const rule of rules) {
      const isMatch =
        (rule.medicationAId === newMedicationId && rule.medicationBId === activeMedId) ||
        (rule.medicationBId === newMedicationId && rule.medicationAId === activeMedId) ||
        // By therapeutic class
        (rule.therapeuticClassA && rule.therapeuticClassB &&
         ((rule.therapeuticClassA === newMedicationTherapeuticClass && rule.therapeuticClassB === activeClass) ||
          (rule.therapeuticClassB === newMedicationTherapeuticClass && rule.therapeuticClassA === activeClass)));

      if (!isMatch) continue;

      const severity: AlertSeverity =
        rule.severity === "contraindicated" ? "critical" :
        rule.severity === "severe" ? "high" :
        rule.severity === "moderate" ? "moderate" : "low";

      alerts.push({
        alertType: "drug_drug_interaction",
        severity,
        title: `Drug Interaction — ${rule.severity.toUpperCase()}`,
        message: `${newMedicationGenericName || newMedicationId} may interact with ${item.medication.genericName || item.medication.brandName}. ${rule.description || ""}`,
        sourceType: "prescription",
        ruleId: `ddi:${rule.id}`,
        evidence: {
          newMedication: newMedicationGenericName || newMedicationId,
          existingMedication: item.medification?.genericName || item.medication?.brandName || activeMedId,
          interactionSeverity: rule.severity,
          description: rule.description,
          clinicalAdvice: rule.clinicalAdvice,
          prescriptionNumber: item.prescription?.prescriptionNumber,
        },
        recommendation: rule.clinicalAdvice || undefined,
        deduplicationKey: `ddi:${patientId}:${newMedicationId}:${activeMedId}:${rule.id}`,
      });
    }
  }

  return alerts;
}

// ─── C. Critical Lab Result Check ───────────────────────────────────
//
// Evaluates a lab result using the existing critical-value configuration.
// Only generates alerts for results flagged as `criticalFlag: true`.
// =====================================================================

export async function checkCriticalLabResult(
  labResultId: string,
  patientId: string,
  encounterId: string | null,
): Promise<CDSSAlert | null> {
  const result = await db.labResult.findUnique({
    where: { id: labResultId },
    include: {
      labOrderItem: {
        include: {
          laboratoryTest: { select: { name: true, code: true } },
          labOrder: { select: { id: true, orderNumber: true, encounterId: true, orderingClinicianId: true } },
        },
      },
    },
  });

  if (!result || !result.criticalFlag) return null;

  const testName = result.labOrderItem?.laboratoryTest?.name || "Unknown Test";
  const orderNumber = result.labOrderItem?.labOrder?.orderNumber || "";

  return {
    alertType: "critical_lab",
    severity: "critical",
    title: `Critical Lab Result — ${testName}`,
    message: `Critical value detected for ${testName} (Order ${orderNumber}): Result = ${result.resultValue} ${result.unit || ""}. Reference range: ${result.referenceRange || "N/A"}. This result requires immediate clinical attention.`,
    sourceType: "lab_result",
    sourceId: labResultId,
    ruleId: "critical-lab-flag",
    evidence: {
      labResultId,
      testName,
      resultValue: result.resultValue,
      unit: result.unit,
      abnormalFlag: result.abnormalFlag,
      flagSource: result.flagSource,
      referenceRange: result.referenceRange,
      orderNumber,
    },
    recommendation: `Review the critical result immediately. Acknowledge receipt and take appropriate clinical action.`,
    deduplicationKey: `critical_lab:${patientId}:${labResultId}`,
  };
}

// ─── D. Abnormal Vitals Check ───────────────────────────────────────
//
// Evaluates vital signs using adult thresholds (per spec §17).
// NOTE: These are ADULT thresholds only. Paediatric/neonatal thresholds
// are NOT implemented (per spec §69 — do not invent unsafe values).
// The system supports the architecture for paediatric thresholds but
// does not activate them until authoritative values are configured.
// =====================================================================

const ADULT_VITAL_THRESHOLDS = {
  // Critical thresholds
  tempCriticalHigh: 39.5,
  tempCriticalLow: 35.0,
  tempFever: 38.5,
  pulseCriticalHigh: 130,
  pulseCriticalLow: 40,
  pulseTachy: 100,
  pulseBrady: 50,
  respCriticalHigh: 30,
  respCriticalLow: 8,
  systolicCriticalHigh: 180,
  systolicCriticalLow: 90,
  systolicHigh: 140,
  diastolicCriticalHigh: 110,
  diastolicCriticalLow: 50,
  spo2Critical: 90,
  spo2Low: 95,
  glucoseCriticalHigh: 400,
  glucoseCriticalLow: 50,
  gcsComa: 8,
  gcsModerate: 12,
};

export function evaluateVitals(vitals: {
  temperature?: number | null;
  pulse?: number | null;
  respiratoryRate?: number | null;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  oxygenSaturation?: number | null;
  bloodGlucose?: number | null;
  gcsTotal?: number | null;
}): CDSSAlert[] {
  const alerts: CDSSAlert[] = [];
  const t = ADULT_VITAL_THRESHOLDS;

  if (vitals.temperature != null) {
    if (vitals.temperature >= t.tempCriticalHigh || vitals.temperature < t.tempCriticalLow) {
      alerts.push(makeVitalAlert("temperature", vitals.temperature, "°C", "critical", t.tempCriticalHigh, t.tempCriticalLow));
    } else if (vitals.temperature >= t.tempFever) {
      alerts.push(makeVitalAlert("temperature", vitals.temperature, "°C", "moderate", t.tempFever, null));
    }
  }

  if (vitals.pulse != null) {
    if (vitals.pulse >= t.pulseCriticalHigh || vitals.pulse < t.pulseCriticalLow) {
      alerts.push(makeVitalAlert("pulse", vitals.pulse, "bpm", "critical", t.pulseCriticalHigh, t.pulseCriticalLow));
    } else if (vitals.pulse >= t.pulseTachy || vitals.pulse < t.pulseBrady) {
      alerts.push(makeVitalAlert("pulse", vitals.pulse, "bpm", "moderate", t.pulseTachy, t.pulseBrady));
    }
  }

  if (vitals.respiratoryRate != null) {
    if (vitals.respiratoryRate >= t.respCriticalHigh || vitals.respiratoryRate < t.respCriticalLow) {
      alerts.push(makeVitalAlert("respiratory_rate", vitals.respiratoryRate, "/min", "critical", t.respCriticalHigh, t.respCriticalLow));
    }
  }

  if (vitals.systolicBp != null) {
    if (vitals.systolicBp >= t.systolicCriticalHigh || vitals.systolicBp < t.systolicCriticalLow) {
      alerts.push(makeVitalAlert("systolic_bp", vitals.systolicBp, "mmHg", "critical", t.systolicCriticalHigh, t.systolicCriticalLow));
    } else if (vitals.systolicBp >= t.systolicHigh) {
      alerts.push(makeVitalAlert("systolic_bp", vitals.systolicBp, "mmHg", "moderate", t.systolicHigh, null));
    }
  }

  if (vitals.diastolicBp != null) {
    if (vitals.diastolicBp >= t.diastolicCriticalHigh || vitals.diastolicBp < t.diastolicCriticalLow) {
      alerts.push(makeVitalAlert("diastolic_bp", vitals.diastolicBp, "mmHg", "critical", t.diastolicCriticalHigh, t.diastolicCriticalLow));
    }
  }

  if (vitals.oxygenSaturation != null) {
    if (vitals.oxygenSaturation < t.spo2Critical) {
      alerts.push(makeVitalAlert("oxygen_saturation", vitals.oxygenSaturation, "%", "critical", null, t.spo2Critical));
    } else if (vitals.oxygenSaturation < t.spo2Low) {
      alerts.push(makeVitalAlert("oxygen_saturation", vitals.oxygenSaturation, "%", "moderate", null, t.spo2Low));
    }
  }

  if (vitals.bloodGlucose != null) {
    if (vitals.bloodGlucose >= t.glucoseCriticalHigh || vitals.bloodGlucose < t.glucoseCriticalLow) {
      alerts.push(makeVitalAlert("blood_glucose", vitals.bloodGlucose, "mg/dL", "critical", t.glucoseCriticalHigh, t.glucoseCriticalLow));
    }
  }

  if (vitals.gcsTotal != null) {
    if (vitals.gcsTotal <= t.gcsComa) {
      alerts.push(makeVitalAlert("gcs_total", vitals.gcsTotal, "", "critical", null, t.gcsComa));
    } else if (vitals.gcsTotal <= t.gcsModerate) {
      alerts.push(makeVitalAlert("gcs_total", vitals.gcsTotal, "", "moderate", null, t.gcsModerate));
    }
  }

  return alerts;
}

function makeVitalAlert(
  vitalType: string,
  value: number,
  unit: string,
  severity: AlertSeverity,
  highThreshold: number | null,
  lowThreshold: number | null,
): CDSSAlert {
  const direction = highThreshold != null && value >= highThreshold ? "high" : "low";
  const thresholdStr = highThreshold != null ? `≥ ${highThreshold}` : lowThreshold != null ? `< ${lowThreshold}` : "";
  return {
    alertType: "abnormal_vital",
    severity,
    title: `Abnormal Vital — ${vitalType.replace(/_/g, " ").toUpperCase()}`,
    message: `${vitalType.replace(/_/g, " ")} = ${value}${unit} (${direction}, threshold ${thresholdStr}).`,
    sourceType: "vital_sign",
    ruleId: `vital-adult:${vitalType}:${direction}`,
    evidence: { vitalType, value, unit, direction, highThreshold, lowThreshold, ageGroup: "adult" },
    recommendation: `Review the vital sign in clinical context and take appropriate action.`,
    deduplicationKey: `abnormal_vital:${vitalType}:${value}:${Date.now().toString().slice(0, -3)}`,
  };
}

// ─── Alert Persistence ──────────────────────────────────────────────
//
// Persists a CDSSAlert to the database with deduplication.
// If an active alert with the same deduplicationKey already exists,
// it is NOT duplicated (per spec §19 — alert deduplication).
// =====================================================================

export async function persistAlert(
  organizationId: string,
  facilityId: string | null,
  patientId: string,
  encounterId: string | null,
  alert: CDSSAlert,
): Promise<string | null> {
  // Check for existing active alert with same deduplication key
  const existing = await db.clinicalAlert.findFirst({
    where: {
      deduplicationKey: alert.deduplicationKey,
      status: "active",
    },
    select: { id: true },
  });
  if (existing) return existing.id; // deduplicated — return existing

  const created = await db.clinicalAlert.create({
    data: {
      organizationId,
      facilityId: facilityId || null,
      patientId,
      encounterId: encounterId || null,
      alertType: alert.alertType,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      sourceType: alert.sourceType || null,
      sourceId: alert.sourceId || null,
      ruleId: alert.ruleId || null,
      evidence: alert.evidence ? JSON.stringify(alert.evidence) : null,
      recommendation: alert.recommendation || null,
      deduplicationKey: alert.deduplicationKey,
      status: "active",
    },
  });

  return created.id;
}

// ─── Alert Lifecycle Actions ────────────────────────────────────────

export async function acknowledgeAlert(alertId: string, userId: string, note?: string): Promise<void> {
  await db.clinicalAlert.update({
    where: { id: alertId },
    data: {
      status: "acknowledged",
      acknowledgedAt: new Date(),
      acknowledgedBy: userId,
      acknowledgedNote: note || null,
    },
  });
}

export async function dismissAlert(alertId: string, userId: string): Promise<void> {
  await db.clinicalAlert.update({
    where: { id: alertId },
    data: {
      status: "dismissed",
      dismissedAt: new Date(),
      dismissedBy: userId,
    },
  });
}

export async function overrideAlert(alertId: string, userId: string, reason: string): Promise<void> {
  await db.clinicalAlert.update({
    where: { id: alertId },
    data: {
      status: "overridden",
      overrideAt: new Date(),
      overrideBy: userId,
      overrideReason: reason,
    },
  });
}

export async function escalateAlert(alertId: string, userId: string): Promise<void> {
  await db.clinicalAlert.update({
    where: { id: alertId },
    data: {
      status: "escalated",
      escalatedAt: new Date(),
      escalatedBy: userId,
    },
  });
}

export async function resolveAlert(alertId: string, userId: string): Promise<void> {
  await db.clinicalAlert.update({
    where: { id: alertId },
    data: {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedBy: userId,
    },
  });
}
