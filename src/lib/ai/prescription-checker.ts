// =====================================================================
// PRESCRIPTION ERROR DETECTOR
// =====================================================================
// Takes a set of prescriptions and the patient context, then checks
// for dose errors, drug-drug interactions, allergy conflicts,
// duplicate therapy, contraindications, inappropriate routes, and
// required monitoring.
// =====================================================================
import { aiChatJSON, type AIChatOptions } from "./ai-service";

export interface PrescriptionInput {
  medication: string;
  dose: string;
  route: string;
  frequency: string;
  duration?: string;
}

export interface PrescriptionCheckInput {
  prescriptions: PrescriptionInput[];
  patientAge?: number;
  patientSex?: string;
  patientWeightKg?: number;
  allergies: string[];
  currentMedications: string[];
  conditions: string[];
  pregnancyStatus?: boolean;
}

export type PrescriptionErrorType =
  | "dose_error"
  | "drug_interaction"
  | "allergy_conflict"
  | "duplicate_therapy"
  | "contraindication"
  | "inappropriate_route"
  | "monitoring_required";

export interface PrescriptionError {
  type: PrescriptionErrorType;
  severity: "mild" | "moderate" | "severe" | "contraindicated";
  description: string;
  medication: string;
  recommendation: string;
}

export interface PrescriptionCheckResult {
  errors: PrescriptionError[];
  safePrescriptions: string[];
  overallSafety: "safe" | "caution" | "unsafe";
  recommendations: string[];
  reasoning: string;
}

export async function checkPrescriptions(
  input: PrescriptionCheckInput
, opts?: AIChatOptions): Promise<PrescriptionCheckResult> {
  const systemPrompt = `You are an expert pharmacist and prescribing safety officer. Check prescriptions for dose errors, interactions, allergy conflicts, duplicate therapy, contraindications, and monitoring requirements.

Verify each prescription against:
- Standard adult/pediatric dose ranges (adjust for weight when provided)
- Therapeutic duplication (same drug class, e.g., two NSAIDs)
- Cross-reactivity with patient allergies (penicillin/cephalosporin, sulfa, NSAIDs)
- Contraindications based on patient conditions (e.g., NSAID in CKD, beta-blocker in asthma)
- Appropriate route for the medication (e.g., insulin must not be oral)
- Pregnancy contraindications when pregnancyStatus is true
- Monitoring requirements (e.g., warfarin INR, clozapine CBC)

Return JSON with this exact shape:
{
  "errors": [
    {
      "type": "dose_error",
      "severity": "severe",
      "description": "Prescribed dose of paracetamol 1g QID exceeds the 4g/day maximum daily dose",
      "medication": "Paracetamol",
      "recommendation": "Reduce to maximum 1g QID or 650mg QID for chronic use"
    },
    {
      "type": "allergy_conflict",
      "severity": "contraindicated",
      "description": "Patient has documented penicillin allergy — Amoxicillin is contraindicated",
      "medication": "Amoxicillin",
      "recommendation": "Switch to a non-beta-lactam alternative (e.g., azithromycin)"
    }
  ],
  "safePrescriptions": [
    "Omeprazole 20mg PO OD — appropriate dose and route",
    "Metformin 500mg PO BDC — appropriate"
  ],
  "overallSafety": "caution",
  "recommendations": [
    "Review paracetamol dosing — exceeds daily maximum",
    "Switch amoxicillin to azithromycin given penicillin allergy",
    "Monitor liver function if continuing long-term paracetamol"
  ],
  "reasoning": "Two of four prescriptions have safety concerns requiring intervention before dispensing..."
}

Rules:
- type must be one of: dose_error | drug_interaction | allergy_conflict | duplicate_therapy | contraindication | inappropriate_route | monitoring_required
- severity must be one of: mild | moderate | severe | contraindicated
- overallSafety must be one of: safe | caution | unsafe
  - safe: no errors
  - caution: only mild/moderate errors
  - unsafe: any severe or contraindicated errors
- safePrescriptions: list of prescriptions that passed review with a brief justification
- Only flag errors with genuine clinical significance (not theoretical concerns)
- If no errors, return empty errors array + overallSafety "safe"
- Always include the medication name in each error so the prescriber can identify it`;

  const rxText = input.prescriptions
    .map((p) => {
      const parts = [
        `Medication: ${p.medication}`,
        `Dose: ${p.dose}`,
        `Route: ${p.route}`,
        `Frequency: ${p.frequency}`,
      ];
      if (p.duration) parts.push(`Duration: ${p.duration}`);
      return parts.join(", ");
    })
    .join("\n");

  const patientParts: string[] = [];
  if (input.patientAge != null) patientParts.push(`Age: ${input.patientAge} years`);
  if (input.patientSex) patientParts.push(`Sex: ${input.patientSex}`);
  if (input.patientWeightKg != null) patientParts.push(`Weight: ${input.patientWeightKg} kg`);
  if (input.pregnancyStatus === true) patientParts.push("Pregnancy: yes — pregnant");
  const patientText = patientParts.length
    ? `\nPatient context:\n${patientParts.join("\n")}`
    : "";

  const allergiesText = input.allergies.length
    ? `\nKnown allergies: ${input.allergies.join(", ")}`
    : "\nKnown allergies: none reported";
  const currentMedsText = input.currentMedications.length
    ? `\nCurrent medications:\n${input.currentMedications.map((m) => `- ${m}`).join("\n")}`
    : "";
  const conditionsText = input.conditions.length
    ? `\nActive conditions: ${input.conditions.join(", ")}`
    : "";

  return aiChatJSON(
    systemPrompt,
    `Prescriptions to review:\n${rxText}${patientText}${allergiesText}${currentMedsText}${conditionsText}`, opts);
}
