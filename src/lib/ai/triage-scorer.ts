// =====================================================================
// TRIAGE ACUITY SCORING
// =====================================================================
// Takes patient vitals + chief complaint and returns a recommended
// triage category (1-5) with reasoning. Based on the South African
// Triage Scale (SATS) which is widely used in Ghana.
// =====================================================================
import { aiChatJSON } from "./ai-service";

export interface TriageInput {
  chiefComplaint: string;
  temperature?: number; // °C
  pulse?: number; // bpm
  respiratoryRate?: number; // /min
  systolicBp?: number; // mmHg
  diastolicBp?: number; // mmHg
  oxygenSaturation?: number; // %
  weight?: number; // kg
  consciousLevel?: string; // alert | responsive to voice | responsive to pain | unresponsive
  age?: number;
  sex?: string;
}

export interface TriageResult {
  category: number; // 1 (emergency) - 5 (non-urgent)
  categoryLabel: string;
  color: string; // red | orange | yellow | green | blue
  reasoning: string;
  redFlags: string[]; // specific concerning findings
  recommendations: string[];
}

export async function scoreTriage(input: TriageInput): Promise<TriageResult> {
  const systemPrompt = `You are an expert triage nurse using the South African Triage Scale (SATS).
Analyze the patient's chief complaint + vital signs and recommend a triage category.

SATS Categories:
1 = EMERGENCY (Red) - Immediate life-saving intervention required
2 = VERY URGENT (Orange) - Must be seen within 10 minutes
3 = URGENT (Yellow) - Must be seen within 60 minutes
4 = LESS URGENT (Green) - Must be seen within 4 hours
5 = NON-URGENT (Blue) - Can wait or be referred

Return JSON with this exact shape:
{
  "category": 3,
  "categoryLabel": "Urgent",
  "color": "yellow",
  "reasoning": "Patient has fever with tachycardia, needs prompt evaluation",
  "redFlags": ["Tachycardia (>100bpm)", "Fever >38.5°C"],
  "recommendations": ["Monitor vitals every 15 min", "Prepare for IV access"]
}

Rules:
- category must be 1-5
- color must match: red/orange/yellow/green/blue
- redFlags: specific concerning findings from the vitals
- recommendations: actionable next steps for the triage nurse
- If any vital sign is in the danger zone (e.g., SpO2 <90%, SBP <90, temp >39.5), category should be 1 or 2`;

  const vitalsText = Object.entries(input)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return aiChatJSON(systemPrompt, `Patient vitals + complaint:\n${vitalsText}`);
}
