// =====================================================================
// AI SERVICE — pluggable interface for all AI-powered features
// =====================================================================
// Architecture for future expansion:
//   - Tries z-ai-web-dev-sdk first (works in dev sandbox where
//     /etc/.z-ai-config exists)
//   - Falls back to direct fetch() if ZAI_API_KEY + ZAI_BASE_URL env
//     vars are set (works on Vercel production with a real AI key)
//   - Returns a graceful error if neither is configured
//   - To add new providers (OpenAI, Anthropic, etc.), just add a new
//     branch in the getAI() function — modules + endpoints stay same
//   - All AI results are ADVISORY ONLY
// =====================================================================

let _zai: any = null;
let _initError: string | null = null;

async function getAI(): Promise<any> {
  if (_zai) return _zai;
  if (_initError) throw new Error(_initError);

  // ── Try z-ai-web-dev-sdk (dev sandbox) ────────────────────────
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    _zai = await ZAI.create();
    return _zai;
  } catch (e: any) {
    const msg = e?.message || String(e);

    // ── Fallback: direct fetch with env vars (Vercel production) ─
    if (process.env.ZAI_API_KEY && process.env.ZAI_BASE_URL) {
      _zai = {
        chat: {
          completions: {
            create: async (body: any) => {
              // Build the URL — ZAI_BASE_URL should include /v1
              // The full endpoint is: {baseUrl}/chat/completions
              const baseUrl = process.env.ZAI_BASE_URL!.replace(/\/$/, "");
              const url = `${baseUrl}/chat/completions`;
              const resp = await fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.ZAI_API_KEY}`,
                  "X-Z-AI-From": "Z", // Required by Z.ai API
                },
                body: JSON.stringify({
                  model: body.model || "glm-4",
                  messages: body.messages,
                  thinking: body.thinking || { type: "disabled" },
                }),
              }
              );
              if (!resp.ok) {
                const errText = await resp.text().catch(() => "");
                throw new Error(`AI API error: ${resp.status} — ${errText.slice(0, 200)}`);
              }
              return resp.json();
            },
          },
        },
      };
      return _zai;
    }

    // ── Neither configured — graceful error ──────────────────────
    _initError = `AI is not configured. To enable AI features:
1. On Vercel: set ZAI_API_KEY and ZAI_BASE_URL environment variables
2. On local dev: ensure /etc/.z-ai-config exists (z-ai-web-dev-sdk sandbox)
3. Or integrate with OpenAI/Anthropic by modifying src/lib/ai/ai-service.ts`;
    throw new Error(_initError);
  }
}

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
    throw e;
  }
}

export async function aiChatJSON(
  systemPrompt: string,
  userMessage: string
): Promise<any> {
  const enhancedPrompt = `${systemPrompt}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences, no additional text. Just the JSON object.`;
  const response = await aiChat(enhancedPrompt, userMessage);
  try {
    return JSON.parse(response);
  } catch {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch {}
    }
    return { raw: response, parseError: true };
  }
}

export async function isAIAvailable(): Promise<boolean> {
  try {
    await getAI();
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset the cached instance (used when env vars change, e.g.
 * after the user configures ZAI_API_KEY on Vercel).
 */
export function resetAI() {
  _zai = null;
  _initError = null;
}
