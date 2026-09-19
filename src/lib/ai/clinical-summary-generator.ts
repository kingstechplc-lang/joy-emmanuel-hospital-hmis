// =====================================================================
// CLINICAL SUMMARY GENERATOR
// =====================================================================
// Takes a patient's clinical snapshot (diagnoses, meds, labs, vitals,
// procedures, notes) and produces a structured summary suitable for
// handover, referral, or chart documentation.
// =====================================================================
import { aiChatJSON, type AIChatOptions } from "./ai-service";

export interface ClinicalSummaryInput {
  patientAge?: number;
  patientSex?: string;
  diagnoses: string[];
  medications: string[];
  labResults: string[];
  vitals: string[];
  procedures: string[];
  notes?: string;
}

export interface ClinicalSummaryResult {
  summary: string;
  keyFindings: string[];
  activeProblems: string[];
  recommendations: string[];
  handoverNote: string;
  referralLetter: string;
}

export async function generateClinicalSummary(
  input: ClinicalSummaryInput
, opts?: AIChatOptions): Promise<ClinicalSummaryResult> {
  const systemPrompt = `You are an expert physician generating a structured clinical summary suitable for handover or referral.
Generate a professional, concise summary.

Structure your response:
- summary: a 3-5 sentence narrative overview of the patient's clinical status
- keyFindings: notable findings from labs/vitals/exam (bullet list)
- activeProblems: the current active problem list (bullet list, prioritized by severity)
- recommendations: actionable next steps for the receiving clinician
- handoverNote: an SBAR-style (Situation-Background-Assessment-Recommendation) handover note, 1 paragraph
- referralLetter: a formal referral letter to a specialist, including salutation, clinical context, specific question/ask, and sign-off

Return JSON with this exact shape:
{
  "summary": "Mr. X is a 67-year-old male admitted for decompensated heart failure...",
  "keyFindings": [
    "Elevated troponin 0.42 ng/mL",
    "Bilateral basal crackles on auscultation",
    "BNP markedly elevated at 1850 pg/mL"
  ],
  "activeProblems": [
    "Acute decompensated heart failure (NYHA IV)",
    "Atrial fibrillation with rapid ventricular response",
    "Stage 3 CKD — monitor renal function"
  ],
  "recommendations": [
    "Continue IV furosemide, monitor urine output",
    "Check daily weights and electrolytes",
    "Consider cardiology referral for echocardiography"
  ],
  "handoverNote": "Situation: 67M admitted with dyspnea...",
  "referralLetter": "Dear Dr. ..., I would be grateful for your review..."
}

Rules:
- Use professional medical terminology throughout
- Avoid PHI (no patient names, IDs, or contact info)
- Keep summary under 200 words; handoverNote under 150 words
- referralLetter should be addressed to a generic specialist (Dear Dr. / Dear Colleague)
- If a section has no content, return an empty array or empty string (not null)`;

  const sections: string[] = [];
  if (input.patientAge != null || input.patientSex)
    sections.push(`Patient: age=${input.patientAge ?? "?"}, sex=${input.patientSex ?? "?"}`);
  if (input.diagnoses.length)
    sections.push(`Diagnoses:\n${input.diagnoses.map((d) => `- ${d}`).join("\n")}`);
  if (input.medications.length)
    sections.push(`Current medications:\n${input.medications.map((m) => `- ${m}`).join("\n")}`);
  if (input.labResults.length)
    sections.push(`Lab results:\n${input.labResults.map((l) => `- ${l}`).join("\n")}`);
  if (input.vitals.length)
    sections.push(`Vitals:\n${input.vitals.map((v) => `- ${v}`).join("\n")}`);
  if (input.procedures.length)
    sections.push(`Procedures:\n${input.procedures.map((p) => `- ${p}`).join("\n")}`);
  if (input.notes) sections.push(`Clinical notes:\n${input.notes}`);

  return aiChatJSON(systemPrompt, `Clinical snapshot:\n\n${sections.join("\n\n")}`, opts);
}
