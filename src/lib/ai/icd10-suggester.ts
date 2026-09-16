// =====================================================================
// ICD-10 CODE SUGGESTION
// =====================================================================
// Takes free-text diagnosis (e.g., "fever and headache for 3 days")
// and returns suggested ICD-10 codes with confidence scores.
// =====================================================================
import { aiChatJSON } from "./ai-service";

export interface ICD10Suggestion {
  code: string;
  description: string;
  confidence: number; // 0.0 - 1.0
}

export interface ICD10Result {
  suggestions: ICD10Suggestion[];
  reasoning: string;
}

export async function suggestICD10(freeText: string): Promise<ICD10Result> {
  const systemPrompt = `You are an expert clinical coder certified in ICD-10 (International Classification of Diseases, 10th Revision).
Given a free-text clinical description, suggest the most appropriate ICD-10 codes.
Consider:
- The primary diagnosis code (most specific)
- Alternative codes if the description is ambiguous
- Common comorbidities that might be relevant

Return JSON with this exact shape:
{
  "suggestions": [
    { "code": "A00.0", "description": "Cholera due to Vibrio cholerae 01, biovar cholerae", "confidence": 0.95 },
    ...
  ],
  "reasoning": "Brief explanation of why these codes were suggested"
}

Rules:
- Code must be a valid ICD-10 format (letter + digits + optional decimal)
- confidence is 0.0-1.0 (higher = more confident)
- Maximum 5 suggestions
- Always include at least 1 suggestion if the input is a recognizable diagnosis`;

  return aiChatJSON(systemPrompt, `Free-text diagnosis: "${freeText}"`);
}
