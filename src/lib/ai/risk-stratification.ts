// =====================================================================
// PATIENT RISK STRATIFICATION
// =====================================================================
// Takes a patient profile (demographics, comorbidities, meds, recent
// events) and scores risk across multiple categories: readmission,
// sepsis, falls, complications, and mortality. Uses validated risk
// factors where available (e.g., LACE, qSOFA, STRATIFY).
// =====================================================================
import { aiChatJSON } from "./ai-service";

export interface RiskStratificationInput {
  age?: number;
  sex?: string;
  comorbidities: string[];
  currentMedications: string[];
  recentDiagnoses: string[];
  recentLabs?: string[];
  recentVitals?: string[];
  admissionHistory?: string[];
}

export type RiskScoreCategory =
  | "readmission"
  | "sepsis"
  | "fall"
  | "complications"
  | "mortality";

export interface RiskScore {
  category: RiskScoreCategory;
  score: number; // 0-100, higher = greater risk
  level: string; // low | moderate | high | very_high
  factors: string[];
}

export interface RiskStratificationResult {
  overallRisk: "low" | "moderate" | "high" | "very_high";
  riskScores: RiskScore[];
  recommendations: string[];
  monitoringRequired: string[];
  reasoning: string;
}

export async function stratifyPatientRisk(
  input: RiskStratificationInput
): Promise<RiskStratificationResult> {
  const systemPrompt = `You are an expert in clinical risk assessment. Score the patient's risk for readmission, sepsis, falls, complications, and mortality. Use validated risk factors.

Apply validated tools where relevant:
- LACE for readmission (Length of stay, Acuity, Comorbidities, ED visits)
- qSOFA for sepsis (RR ≥22, altered mentation, SBP ≤100)
- STRATIFY / Morse for fall risk
- Charlson Comorbidity Index for mortality
- ASA physical status for perioperative complications

Return JSON with this exact shape:
{
  "overallRisk": "moderate",
  "riskScores": [
    {
      "category": "readmission",
      "score": 65,
      "level": "high",
      "factors": ["LACE score elevated", "Multiple comorbidities", "Recent ED visit"]
    },
    {
      "category": "sepsis",
      "score": 30,
      "level": "moderate",
      "factors": ["RR 24", "Suspected infection"]
    }
  ],
  "recommendations": [
    "Schedule early follow-up within 7 days of discharge",
    "Implement sepsis pathway and monitor lactate trend"
  ],
  "monitoringRequired": [
    "Vital signs every 4 hours",
    "Daily lactate until stable",
    "Daily weights"
  ],
  "reasoning": "The patient's elevated LACE components (multiple comorbidities and recent ED visits)..."
}

Rules:
- overallRisk must be one of: low | moderate | high | very_high
- level in each RiskScore must be: low | moderate | high | very_high
- score must be 0-100 (integer)
- Only include categories where the patient has identifiable risk factors
- If patient is low-risk across the board, return score 10-20 for each category
- recommendations: specific, actionable mitigation strategies
- monitoringRequired: concrete monitoring parameters with frequency
- Cite the scoring tool used in factors when applicable`;

  const sections: string[] = [];
  if (input.age != null) sections.push(`Age: ${input.age}`);
  if (input.sex) sections.push(`Sex: ${input.sex}`);
  if (input.comorbidities.length)
    sections.push(`Comorbidities:\n${input.comorbidities.map((c) => `- ${c}`).join("\n")}`);
  if (input.currentMedications.length)
    sections.push(
      `Current medications:\n${input.currentMedications.map((m) => `- ${m}`).join("\n")}`
    );
  if (input.recentDiagnoses.length)
    sections.push(
      `Recent diagnoses:\n${input.recentDiagnoses.map((d) => `- ${d}`).join("\n")}`
    );
  if (input.recentLabs?.length)
    sections.push(`Recent labs:\n${input.recentLabs.map((l) => `- ${l}`).join("\n")}`);
  if (input.recentVitals?.length)
    sections.push(`Recent vitals:\n${input.recentVitals.map((v) => `- ${v}`).join("\n")}`);
  if (input.admissionHistory?.length)
    sections.push(
      `Admission history:\n${input.admissionHistory.map((a) => `- ${a}`).join("\n")}`
    );

  return aiChatJSON(systemPrompt, `Patient profile:\n\n${sections.join("\n\n")}`);
}
