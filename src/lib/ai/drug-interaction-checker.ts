// =====================================================================
// DRUG INTERACTION CHECKER
// =====================================================================
// Takes a list of medications + patient context and identifies
// drug-drug and drug-allergy interactions. Returns structured
// interactions with severity, mechanism, clinical effect, and
// management recommendations.
// =====================================================================
import { aiChatJSON, type AIChatOptions } from "./ai-service";

export interface MedicationInput {
  name: string;
  dose?: string;
  route?: string;
  frequency?: string;
}

export interface DrugInteractionCheckerInput {
  medications: MedicationInput[];
  allergies: string[];
  patientAge?: number;
  patientSex?: string;
  patientWeightKg?: number;
  conditions: string[];
}

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: "mild" | "moderate" | "severe" | "contraindicated";
  mechanism: string;
  clinicalEffect: string;
  management: string;
  evidence: string;
}

export interface AllergyWarning {
  drug: string;
  allergen: string;
  severity: "mild" | "moderate" | "severe" | "contraindicated";
  recommendation: string;
}

export interface DrugInteractionCheckerResult {
  interactions: DrugInteraction[];
  allergyWarnings: AllergyWarning[];
  overallRisk: "low" | "moderate" | "high" | "contraindicated";
  recommendations: string[];
  reasoning: string;
}

export async function checkDrugInteractions(
  input: DrugInteractionCheckerInput
, opts?: AIChatOptions): Promise<DrugInteractionCheckerResult> {
  const systemPrompt = `You are an expert clinical pharmacist specializing in drug-drug and drug-allergy interactions.
Analyze the medication list for potential interactions. Severity levels: mild | moderate | severe | contraindicated.

Consider:
- Pharmacokinetic interactions (CYP450 enzyme induction/inhibition, P-gp, etc.)
- Pharmacodynamic interactions (additive/synergistic/antagonistic effects)
- Allergy cross-reactivity (e.g., penicillin ↔ cephalosporin)
- Patient-specific factors (age, weight, comorbidities, organ function)
- Dose-dependent interactions

Return JSON with this exact shape:
{
  "interactions": [
    {
      "drug1": "warfarin",
      "drug2": "aspirin",
      "severity": "severe",
      "mechanism": "Pharmacodynamic synergy — both affect hemostasis",
      "clinicalEffect": "Increased risk of major bleeding",
      "management": "Avoid combination. If both required, monitor INR closely and consider GI protection",
      "evidence": "Well-established interaction documented in Stockley's Drug Interactions"
    }
  ],
  "allergyWarnings": [
    {
      "drug": "Amoxicillin",
      "allergen": "Penicillin",
      "severity": "contraindicated",
      "recommendation": "Do not prescribe — cross-reactivity with penicillin allergy"
    }
  ],
  "overallRisk": "moderate",
  "recommendations": ["Monitor renal function weekly", "Consider alternative to amoxicillin"],
  "reasoning": "Patient on warfarin with newly prescribed aspirin creates a significant bleeding risk..."
}

Rules:
- severity must be one of: mild | moderate | severe | contraindicated
- overallRisk must be one of: low | moderate | high | contraindicated
- Only flag interactions with clinical significance (not theoretical/minor)
- Provide actionable management steps for each interaction
- If no interactions: return empty arrays + overallRisk "low"
- For allergy warnings, consider cross-reactivity classes (beta-lactams, sulfa drugs, NSAIDs)
- evidence: cite known interaction database or guideline when possible`;

  const medicationsText = input.medications
    .map((m) => {
      const parts = [m.name];
      if (m.dose) parts.push(`dose: ${m.dose}`);
      if (m.route) parts.push(`route: ${m.route}`);
      if (m.frequency) parts.push(`freq: ${m.frequency}`);
      return parts.join(", ");
    })
    .join("\n");

  const patientParts: string[] = [];
  if (input.patientAge != null) patientParts.push(`Age: ${input.patientAge} years`);
  if (input.patientSex) patientParts.push(`Sex: ${input.patientSex}`);
  if (input.patientWeightKg != null) patientParts.push(`Weight: ${input.patientWeightKg} kg`);
  const patientText = patientParts.length
    ? `\nPatient context:\n${patientParts.join("\n")}`
    : "";

  const allergiesText = input.allergies.length
    ? `\nKnown allergies: ${input.allergies.join(", ")}`
    : "\nKnown allergies: none reported";
  const conditionsText = input.conditions.length
    ? `\nActive conditions: ${input.conditions.join(", ")}`
    : "";

  return aiChatJSON(
    systemPrompt,
    `Medications:\n${medicationsText}${patientText}${allergiesText}${conditionsText}`, opts);
}
