// =====================================================================
// AI SERVICE — pluggable interface for all AI-powered features
// =====================================================================
// Architecture for future expansion:
//   - Single ZAI instance (reused across requests — best practice per
//     the LLM skill docs)
//   - Each AI feature is a separate module in this directory
//   - All modules call aiChat() or aiChatJSON() — never import ZAI
//     directly
//   - To swap providers (e.g., add OpenAI later), only this file
//     changes — the modules + API endpoints stay the same
//   - All AI calls should be audited by the calling API endpoint
//   - AI results are ADVISORY ONLY — the clinician always decides
// =====================================================================
import ZAI from "z-ai-web-dev-sdk";

let _zai: any = null;

async function getAI(): Promise<any> {
  if (!_zai) {
    _zai = await ZAI.create();
  }
  return _zai;
}

/**
 * Send a single-turn chat completion to the LLM.
 * @param systemPrompt — defines the AI's role + behavior
 * @param userMessage — the user's input
 * @returns the AI's text response
 */
export async function aiChat(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  try {
    const zai = await getAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      thinking: { type: "disabled" },
    });
    return completion.choices[0]?.message?.content || "";
  } catch (e: any) {
    console.error("[AI Service] aiChat failed:", e?.message || e);
    throw new Error(`AI request failed: ${e?.message || "unknown error"}`);
  }
}

/**
 * Send a chat completion + parse the response as JSON.
 * Automatically appends "Respond with valid JSON only" to the system
 * prompt + extracts JSON from the response (handles markdown code
 * fences).
 */
export async function aiChatJSON(
  systemPrompt: string,
  userMessage: string
): Promise<any> {
  const enhancedPrompt = `${systemPrompt}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences, no additional text. Just the JSON object.`;
  const response = await aiChat(enhancedPrompt, userMessage);
  try {
    // Try direct parse first
    return JSON.parse(response);
  } catch {
    // Try extracting JSON from markdown code fences or surrounding text
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall through
      }
    }
    // Return the raw text if we can't parse JSON
    return { raw: response, parseError: true };
  }
}

/**
 * Check if the AI service is available (the SDK is installed + can
 * create an instance). Used by API endpoints to return a friendly
 * error if AI is not configured.
 */
export async function isAIAvailable(): Promise<boolean> {
  try {
    await getAI();
    return true;
  } catch {
    return false;
  }
}
