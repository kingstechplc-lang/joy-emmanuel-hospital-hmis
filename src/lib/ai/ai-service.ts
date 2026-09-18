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

// =====================================================================
// CANONICAL DEFAULT MODEL — single source of truth for the whole app.
// =====================================================================
// Verified 2025-Q3 against the public Z.ai international API
// (https://api.z.ai/api/paas/v4) with the project's live API key:
//   - glm-4-plus        → 429 "Insufficient balance" (code 1113) ✅ VALID MODEL
//   - glm-4-flash       → 400 "Unknown Model"        (code 1211) ❌ NOT AVAILABLE
//   - glm-4             → 400 "Unknown Model"        (code 1211) ❌ NOT AVAILABLE
//   - chatglm_turbo     → 400 "Unknown Model"        (code 1211) ❌ NOT AVAILABLE
//   - chatglm_plus      → 400 "Unknown Model"        (code 1211) ❌ NOT AVAILABLE
// `glm-4-flash` is published on the Chinese platform (open.bigmodel.cn) but
// is NOT routable on this account's international api.z.ai endpoint, so we
// use `glm-4-plus` as the only verified-valid default. Override at deploy
// time by setting the `ZAI_MODEL` env var (e.g. if Z.ai opens up a free tier
// model on this account later).
// =====================================================================
export const DEFAULT_ZAI_MODEL = "glm-4-plus";

/** Resolve the model name to send to the API. Env var wins, then default. */
function resolveModel(override?: string): string {
  return override || process.env.ZAI_MODEL || DEFAULT_ZAI_MODEL;
}

/**
 * Sanitize + map upstream Z.ai errors to actionable, key-safe messages.
 * Never includes the API key, never echoes the full upstream body raw.
 * Returns a single-line string safe to surface to the browser.
 */
function formatZaiApiError(status: number, errText: string): string {
  const trimmed = (errText || "").trim().slice(0, 400);
  let code = "";
  let upstreamMsg = "";
  try {
    const parsed = JSON.parse(trimmed);
    code = String(parsed?.error?.code ?? "");
    upstreamMsg = String(parsed?.error?.message ?? "").slice(0, 200);
  } catch {
    // Non-JSON upstream body — keep the raw text but truncated (no keys leak).
    upstreamMsg = trimmed.slice(0, 200);
  }

  // Map known Z.ai error codes to actionable messages.
  if (status === 429 || code === "1113") {
    return (
      `AI provider rejected request: insufficient balance on the Z.ai account (HTTP 429, code 1113). ` +
      `Top up at https://z.ai billing, or set ZAI_MODEL to a free-tier model if your account has access. ` +
      `Model used: ${resolveModel()}.`
    );
  }
  if (status === 400 && code === "1211") {
    return (
      `AI provider rejected model name as unknown (HTTP 400, code 1211). ` +
      `Verified-valid model on api.z.ai for this account: glm-4-plus. ` +
      `Set ZAI_MODEL=glm-4-plus on Vercel (or unset it to fall back to the default). ` +
      `Model used: ${resolveModel()}.`
    );
  }
  if (status === 401 || code === "1001") {
    return (
      `AI provider authentication failed (HTTP 401). Check that ZAI_API_KEY is set correctly on Vercel. `
    );
  }
  // Fallback: include the (truncated, key-free) upstream message so the operator
  // can still diagnose novel errors without us surfacing the raw payload.
  return `AI API error: ${status}${code ? ` (code ${code})` : ""}${upstreamMsg ? ` — ${upstreamMsg}` : ""}`;
}

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
    if (process.env.ZAI_API_KEY && (process.env.ZAI_BASE_URL || process.env.ZAI_CHAT_URL)) {
      _zai = {
        chat: {
          completions: {
            create: async (body: any) => {
              // URL construction:
              // - If ZAI_CHAT_URL is set, use it directly (full URL)
              // - Otherwise: {ZAI_BASE_URL}/chat/completions
              let url = process.env.ZAI_CHAT_URL;
              if (!url) {
                const baseUrl = process.env.ZAI_BASE_URL!.replace(/\/$/, "");
                url = `${baseUrl}/chat/completions`;
              }
              console.log("[AI Service] fetch URL:", url);
              const resp = await fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.ZAI_API_KEY}`,
                },
                body: JSON.stringify({
                  model: resolveModel(body.model),
                  messages: body.messages,
                  // NOTE: 'thinking' parameter removed — it's an internal
                  // SDK feature that the public Z.ai API doesn't support.
                  // Including it may cause 400 errors on some models.
                }),
              });
              if (!resp.ok) {
                const errText = await resp.text().catch(() => "");
                throw new Error(formatZaiApiError(resp.status, errText));
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
