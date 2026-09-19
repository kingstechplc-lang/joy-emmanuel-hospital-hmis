// =====================================================================
// PEDIATRIC DOSE CHECKING
// =====================================================================
// Takes a medication name + patient weight + age and verifies the
// weight-based dosing is correct. Returns dose verification with
// safety warnings.
// =====================================================================
import { aiChatJSON, type AIChatOptions } from "./ai-service";

export interface DoseCheckInput {
  medicationName: string;
  medicationStrength?: string; // e.g., "250mg/5mL"
  prescribedDose?: string; // e.g., "5 mL"
  prescribedFrequency?: string; // e.g., "3 times daily"
  prescribedRoute?: string; // e.g., "oral"
  patientWeightKg?: number;
  patientAgeMonths?: number;
  patientAgeYears?: number;
  indication?: string; // what is being treated
}

export interface DoseCheckResult {
  isSafe: boolean;
  recommendedDoseRange: string; // e.g., "10-15 mg/kg/dose, max 500mg"
  calculatedDosePerKg: string; // e.g., "12.5 mg/kg — within recommended range"
  warnings: string[];
  alternativeSuggestions: string[];
  reasoning: string;
}

export async function checkPediatricDose(input: DoseCheckInput, opts?: AIChatOptions): Promise<DoseCheckResult> {
  const systemPrompt = `You are an expert pediatric pharmacist. Verify weight-based dosing for pediatric prescriptions.
Consider:
- Standard mg/kg dosing for the medication
- Maximum single dose limits
- Age-appropriate adjustments (neonate vs infant vs child)
- Frequency appropriateness
- Route appropriateness
- Contraindications based on age

Return JSON with this exact shape:
{
  "isSafe": true,
  "recommendedDoseRange": "10-15 mg/kg/dose, max 500mg per dose, max 4 doses/day",
  "calculatedDosePerKg": "If weight is 10kg and dose is 125mg, that's 12.5 mg/kg — within range",
  "warnings": ["Dose is at upper end of range — monitor for side effects"],
  "alternativeSuggestions": ["Could reduce to 100mg (10mg/kg) if tolerability is a concern"],
  "reasoning": "Amoxicillin standard pediatric dosing is 40-90 mg/kg/day divided into 3 doses..."
}

Rules:
- isSafe: false if the dose is outside the recommended range or contraindicated
- warnings: specific safety concerns, contraindications
- Always include the recommended dose range for reference
- If weight is not provided, note that dose verification cannot be completed`;

  const inputText = Object.entries(input)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return aiChatJSON(systemPrompt, `Prescription details:\n${inputText}`, opts);
}
