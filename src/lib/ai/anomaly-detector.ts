// =====================================================================
// LAB RESULT ANOMALY DETECTION
// =====================================================================
// Takes a set of lab results and identifies unusual patterns,
// critical values, and potential lab errors that warrant review.
// =====================================================================
import { aiChatJSON } from "./ai-service";

export interface LabResultInput {
  testName: string;
  resultValue?: string;
  numericValue?: number;
  unit?: string;
  referenceRange?: string;
  abnormalFlag?: string;
  patientAge?: number;
  patientSex?: string;
}

export interface AnomalyResult {
  anomalies: Array<{
    testName: string;
    type: "critical" | "abnormal" | "trend" | "potential_error";
    description: string;
    recommendation: string;
  }>;
  patterns: string[]; // cross-test patterns (e.g., "low Hb + high reticulocytes → hemolysis")
  reasoning: string;
  overallAssessment: string;
}

export async function detectAnomalies(results: LabResultInput[]): Promise<AnomalyResult> {
  const systemPrompt = `You are an expert clinical pathologist + lab scientist. Analyze a set of lab results and identify:
1. Critical values that require immediate attention
2. Abnormal results that fall outside reference ranges
3. Cross-test patterns that suggest a clinical condition
4. Potential lab errors (e.g., incompatible values, units mismatch)

Return JSON with this exact shape:
{
  "anomalies": [
    {
      "testName": "Hemoglobin",
      "type": "critical",
      "description": "Hb 4.5 g/dL is critically low — requires immediate transfusion consideration",
      "recommendation": "Notify ordering clinician immediately, prepare for blood transfusion"
    }
  ],
  "patterns": ["Low Hb + high reticulocytes → possible hemolytic anemia"],
  "reasoning": "The combination of...",
  "overallAssessment": "These results indicate severe anemia requiring urgent intervention"
}

Rules:
- type must be one of: critical | abnormal | trend | potential_error
- Only flag results that are genuinely outside normal ranges
- patterns: identify 2+ tests that together suggest a condition
- overallAssessment: a one-sentence summary for the clinician
- If all results are normal, return empty arrays + assessment "All results within normal limits"`;

  const resultsText = results
    .map((r) => {
      const parts = [r.testName];
      if (r.resultValue) parts.push(`value: ${r.resultValue}${r.unit ? " " + r.unit : ""}`);
      if (r.numericValue != null) parts.push(`numeric: ${r.numericValue}${r.unit ? " " + r.unit : ""}`);
      if (r.referenceRange) parts.push(`ref: ${r.referenceRange}`);
      if (r.abnormalFlag) parts.push(`flag: ${r.abnormalFlag}`);
      return parts.join(", ");
    })
    .join("\n");

  const patientInfo = results[0]?.patientAge || results[0]?.patientSex
    ? `\nPatient: age=${results[0]?.patientAge || "?"}, sex=${results[0]?.patientSex || "?"}`
    : "";

  return aiChatJSON(systemPrompt, `Lab results:\n${resultsText}${patientInfo}`);
}
