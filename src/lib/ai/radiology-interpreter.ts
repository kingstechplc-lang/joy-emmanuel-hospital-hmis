// =====================================================================
// RADIOLOGY REPORT INTERPRETER
// =====================================================================
// Takes a free-text radiology report and parses out structured
// findings, laterality, severity, size, impression, differential
// diagnoses, recommended actions, and critical findings requiring
// urgent clinician attention.
// =====================================================================
import { aiChatJSON, type AIChatOptions } from "./ai-service";

export interface RadiologyInterpretInput {
  reportText: string;
  modality?: string; // X-ray | CT | MRI | US | Mammogram | Fluoroscopy
  bodyPart?: string;
  patientAge?: number;
  patientSex?: string;
}

export interface RadiologyFinding {
  finding: string;
  location: string;
  laterality: string; // left | right | bilateral | midline | not_applicable
  severity: "normal" | "mild" | "moderate" | "severe" | "critical";
  size?: string;
  description: string;
}

export interface RadiologyInterpretResult {
  findings: RadiologyFinding[];
  impression: string;
  differentialDiagnosis: string[];
  recommendedActions: string[];
  criticalFindings: string[];
  followUpRecommended: boolean;
  reasoning: string;
}

export async function interpretRadiologyReport(
  input: RadiologyInterpretInput
, opts?: AIChatOptions): Promise<RadiologyInterpretResult> {
  const systemPrompt = `You are an expert radiologist. Parse the free-text radiology report and extract structured findings, impressions, and recommendations.

Return JSON with this exact shape:
{
  "findings": [
    {
      "finding": "Pulmonary nodule",
      "location": "Right upper lobe",
      "laterality": "right",
      "severity": "moderate",
      "size": "8 mm",
      "description": "Solid spiculated nodule in the apical segment of the right upper lobe"
    }
  ],
  "impression": "Right upper lobe pulmonary nodule measuring 8mm with spiculated margins — requires follow-up imaging per Fleischner criteria.",
  "differentialDiagnosis": [
    "Primary lung malignancy",
    "Granulomatous disease",
    "Hamartoma"
  ],
  "recommendedActions": [
    "Follow-up CT in 3 months (per Fleischner Society criteria for 6-8mm nodules)",
    "Consider PET-CT if nodule grows or patient is high-risk"
  ],
  "criticalFindings": [
    "Possible pneumothorax — please confirm with the ordering clinician"
  ],
  "followUpRecommended": true,
  "reasoning": "An 8mm spiculated nodule in a smoker has anintermediate probability of malignancy..."
}

Rules:
- laterality must be one of: left | right | bilateral | midline | not_applicable
- severity must be one of: normal | mild | moderate | severe | critical
- criticalFindings: findings that require IMMEDIATE clinician notification (e.g., pneumothorax, aortic dissection, intracranial bleed). Leave empty array if none.
- impression: 1-3 sentences summarizing the key conclusion
- differentialDiagnosis: ordered by likelihood
- recommendedActions: concrete next steps (imaging, referral, intervention)
- followUpRecommended: true if any follow-up imaging or clinical review is warranted
- If the report is normal, return a single finding with severity "normal" and an impression stating "No acute abnormalities identified"`;

  const contextParts: string[] = [];
  if (input.modality) contextParts.push(`Modality: ${input.modality}`);
  if (input.bodyPart) contextParts.push(`Body part: ${input.bodyPart}`);
  if (input.patientAge != null) contextParts.push(`Patient age: ${input.patientAge}`);
  if (input.patientSex) contextParts.push(`Patient sex: ${input.patientSex}`);
  const contextText = contextParts.length
    ? `Report context:\n${contextParts.join("\n")}\n\n`
    : "";

  return aiChatJSON(
    systemPrompt,
    `${contextText}Radiology report text:\n"""\n${input.reportText}\n"""`, opts);
}
