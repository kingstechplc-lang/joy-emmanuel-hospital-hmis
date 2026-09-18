// =====================================================================
// DISCHARGE SUMMARY AUTO-GENERATOR
// =====================================================================
// Takes the structured encounter data (diagnoses, labs, meds,
// consultations, procedures, vitals, dates) and produces a
// complete discharge summary following the standard medical format.
// =====================================================================
import { aiChatJSON } from "./ai-service";

export interface DischargeGenerateInput {
  encounterId?: string;
  diagnoses: string[];
  labResults: string[];
  medications: string[];
  consultations: string[];
  procedures?: string[];
  vitals?: string[];
  admissionDate?: string;
  dischargeDate?: string;
}

export interface DischargeSummaryResult {
  admissionDiagnosis: string;
  dischargeDiagnosis: string;
  clinicalCourse: string;
  investigationsSummary: string;
  treatmentSummary: string;
  dischargeMedications: string[];
  followUpPlan: string;
  patientInstructions: string;
  summary: string;
}

export async function generateDischargeSummary(
  input: DischargeGenerateInput
): Promise<DischargeSummaryResult> {
  const systemPrompt = `You are an expert physician generating a structured discharge summary from encounter data. Follow standard medical discharge summary format.

Include:
- admissionDiagnosis: the working diagnosis at admission (concise, with ICD terminology)
- dischargeDiagnosis: the final confirmed diagnosis at discharge (or "resolved" if applicable)
- clinicalCourse: narrative summary of hospital course (200-300 words)
- investigationsSummary: concise summary of key investigations and their results
- treatmentSummary: summary of treatments administered (medications, procedures, therapies)
- dischargeMedications: complete list of medications to continue at home (with dose, route, frequency, duration)
- followUpPlan: specific follow-up arrangements (specialist, GP, clinic, timing)
- patientInstructions: clear, lay-friendly instructions for the patient at home (red flags, lifestyle, when to return)
- summary: a 2-3 sentence summary of the entire admission (for the GP/recipient)

Return JSON with this exact shape:
{
  "admissionDiagnosis": "Community-acquired pneumonia",
  "dischargeDiagnosis": "Community-acquired pneumonia — resolved",
  "clinicalCourse": "Patient was admitted via ED with 3-day history of productive cough, fever, and dyspnea...",
  "investigationsSummary": "CXR showed right lower lobe consolidation. WBC 14.5, CRP 180, blood cultures negative. Sputum culture grew Streptococcus pneumoniae.",
  "treatmentSummary": "Treated with IV ceftriaxone 2g OD for 5 days, transitioned to oral amoxicillin 1g TDS for 2 days. Received supplemental oxygen and paracetamol for fever.",
  "dischargeMedications": [
    "Amoxicillin 500mg PO TDS for 3 more days",
    "Paracetamol 1g PO QID PRN"
  ],
  "followUpPlan": "GP review in 1 week, repeat CXR in 6 weeks, respiratory clinic review in 4 weeks if not resolved",
  "patientInstructions": "Complete the full course of antibiotics. Return immediately if breathing difficulty, chest pain, or high fever returns. Drink plenty of fluids and rest.",
  "summary": "67M admitted with CAP, treated with IV antibiotics, clinically improved, discharged on oral antibiotics with GP follow-up."
}

Rules:
- Use formal medical terminology for clinical sections
- patientInstructions: must be in plain language a non-medical patient can understand
- dischargeMedications: each item as a complete prescription string
- Avoid PHI (no patient names, IDs, contact info)
- If a section has no data, return an empty string or empty array, not null`;

  const sections: string[] = [];
  if (input.encounterId) sections.push(`Encounter ID: ${input.encounterId}`);
  if (input.admissionDate) sections.push(`Admission date: ${input.admissionDate}`);
  if (input.dischargeDate) sections.push(`Discharge date: ${input.dischargeDate}`);
  if (input.diagnoses.length)
    sections.push(`Diagnoses:\n${input.diagnoses.map((d) => `- ${d}`).join("\n")}`);
  if (input.labResults.length)
    sections.push(`Lab results:\n${input.labResults.map((l) => `- ${l}`).join("\n")}`);
  if (input.medications.length)
    sections.push(
      `Inpatient medications:\n${input.medications.map((m) => `- ${m}`).join("\n")}`
    );
  if (input.consultations.length)
    sections.push(
      `Consultations:\n${input.consultations.map((c) => `- ${c}`).join("\n")}`
    );
  if (input.procedures?.length)
    sections.push(`Procedures:\n${input.procedures.map((p) => `- ${p}`).join("\n")}`);
  if (input.vitals?.length)
    sections.push(`Vitals:\n${input.vitals.map((v) => `- ${v}`).join("\n")}`);

  return aiChatJSON(systemPrompt, `Encounter data:\n\n${sections.join("\n\n")}`);
}
