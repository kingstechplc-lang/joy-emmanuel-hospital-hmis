// =====================================================================
// AI SERVICE — database-backed provider/model resolution
// =====================================================================
// Resolution chain (highest priority wins):
//   1. Database: active AIProvider (isDefault=true) + active AICredential
//      + AIModel (defaultForProvider=true)
//   2. Environment variables: ZAI_API_KEY + ZAI_BASE_URL + ZAI_MODEL
//   3. No configuration → returns clear error
//
// The AI Assistant UI, API routes, and clinical modules all call
// aiChat() or aiChatJSON() — they never need to know which provider
// or model is active. The resolver handles everything.
//
// To add a new provider (OpenAI, Anthropic, etc.), an admin creates
// an AIProvider record with the correct baseUrl + providerType, adds
// an AICredential with the API key, and adds an AIModel with the
// correct modelCode. No code changes needed for OpenAI-compatible
// providers (most are). For non-standard protocols (Anthropic), a
// new adapter branch would be needed in the fetch fallback.
// =====================================================================
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/ai/crypto";

export const DEFAULT_ZAI_MODEL = "glm-4-plus";
export const DEFAULT_ZAI_BASE_URL = "https://api.z.ai/api/paas/v4";

export interface AIRuntimeConfig {
  providerCode: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  modelCode: string;
  displayName: string;
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  temperature?: number;
  maxTokens?: number;
  source: "database" | "environment" | "none";
}

// =====================================================================
// AI CHAT OPTIONS — optional context for usage logging
// =====================================================================
// `userId` — the calling user's id, written to AIUsageLog.userId so
//   the admin dashboard can show "calls by user" stats.
// `tool` — which AI feature triggered the call (e.g. "icd10", "triage"),
//   written to AIUsageLog.tool so the dashboard can show "calls by
//   tool" stats.
//
// Both are optional — existing callers that don't pass them continue
// to work, just without those dimensions on the usage log row.
// =====================================================================
export interface AIChatOptions {
  userId?: string;
  tool?: string;
}

let _cachedConfig: AIRuntimeConfig | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 1 minute — balances performance vs config-change responsiveness

/**
 * Resolve the active AI runtime configuration.
 * Checks the database first, falls back to env vars.
 * Results are cached for 60 seconds to avoid querying the DB on
 * every AI request.
 */
export async function resolveActiveAIConfig(): Promise<AIRuntimeConfig> {
  // Check cache
  if (_cachedConfig && Date.now() < _cacheExpiry) {
    return _cachedConfig;
  }

  // ── 1. Try database configuration ──────────────────────────────
  try {
    const provider = await db.aIProvider.findFirst({
      where: { active: true, isDefault: true },
      include: {
        models: {
          where: { active: true, defaultForProvider: true },
          take: 1,
        },
        credentials: {
          where: { active: true },
          take: 1,
        },
      },
    });

    if (provider && provider.models.length > 0 && provider.credentials.length > 0) {
      const model = provider.models[0];
      const cred = provider.credentials[0];
      const apiKey = decryptApiKey(cred.apiKeyEncrypted, cred.apiKeyIv, cred.apiKeyTag);

      if (apiKey) {
        const config: AIRuntimeConfig = {
          providerCode: provider.code,
          providerName: provider.name,
          baseUrl: provider.baseUrl,
          apiKey,
          modelCode: model.modelCode,
          displayName: model.displayName,
          supportsThinking: model.supportsThinking,
          supportsVision: model.supportsVision,
          supportsTools: model.supportsTools,
          temperature: model.temperatureDefault ?? undefined,
          maxTokens: model.maxTokensDefault ?? undefined,
          source: "database",
        };
        _cachedConfig = config;
        _cacheExpiry = Date.now() + CACHE_TTL_MS;
        return config;
      }
    }
  } catch (e) {
    console.error("[AI Service] DB config lookup failed:", e);
    // Fall through to env var fallback
  }

  // ── 2. Try environment variables ───────────────────────────────
  if (process.env.ZAI_API_KEY && (process.env.ZAI_BASE_URL || process.env.ZAI_CHAT_URL)) {
    const config: AIRuntimeConfig = {
      providerCode: "zai",
      providerName: "Z.ai (env var)",
      baseUrl: process.env.ZAI_BASE_URL || process.env.ZAI_CHAT_URL?.replace(/\/chat\/completions$/, "") || DEFAULT_ZAI_BASE_URL,
      apiKey: process.env.ZAI_API_KEY,
      modelCode: process.env.ZAI_MODEL || DEFAULT_ZAI_MODEL,
      displayName: process.env.ZAI_MODEL || DEFAULT_ZAI_MODEL,
      supportsThinking: false,
      supportsVision: false,
      supportsTools: false,
      source: "environment",
    };
    _cachedConfig = config;
    _cacheExpiry = Date.now() + CACHE_TTL_MS;
    return config;
  }

  // ── 3. No configuration ────────────────────────────────────────
  const noConfig: AIRuntimeConfig = {
    providerCode: "none",
    providerName: "Not configured",
    baseUrl: "",
    apiKey: "",
    modelCode: "",
    displayName: "Not configured",
    supportsThinking: false,
    supportsVision: false,
    supportsTools: false,
    source: "none",
  };
  return noConfig;
}

/**
 * Clear the cached config — call after admin changes AI configuration.
 */
export function clearAIConfigCache() {
  _cachedConfig = null;
  _cacheExpiry = 0;
}

// =====================================================================
// SANITIZED ERROR FORMATTING — never exposes API keys/secrets
// =====================================================================
export function formatAIError(status: number, errText: string): string {
  try {
    const err = JSON.parse(errText);
    const code = err?.error?.code || err?.code || "";
    const msg = err?.error?.message || err?.message || errText.slice(0, 200);

    // Map known Z.ai error codes to user-friendly messages
    if (status === 429 && code === "1113") {
      return "AI service has insufficient balance. Please add credits to the AI provider account or contact your administrator.";
    }
    if (status === 400 && code === "1211") {
      return "AI model configuration error. The configured model is not recognized by the provider. An administrator must update the AI model in Administration → AI Services.";
    }
    if (status === 401 || code === "1001") {
      return "AI authentication failed. The API key may be incorrect or expired. An administrator must update the AI credentials in Administration → AI Services.";
    }
    if (status === 429) {
      return "AI service is rate-limited. Please try again in a moment.";
    }
    if (status >= 500) {
      return "AI provider is temporarily unavailable. Please try again later.";
    }
    // For 400/404 errors, include the actual error message so the admin
    // can see what's wrong (wrong model name, wrong URL, etc.)
    // Never include API keys — only error.code + error.message from upstream
    if (msg) {
      return `AI request failed (HTTP ${status}): ${msg}`;
    }
    return `AI request failed (HTTP ${status}). Please contact your administrator if this persists.`;
  } catch {
    // JSON parse failed — return the raw text (truncated, no secrets)
    return `AI request failed (HTTP ${status}): ${errText.slice(0, 200)}`;
  }
}

// =====================================================================
// USAGE LOGGING — writes a row to AIUsageLog after every AI call.
// Non-blocking: failures here never propagate to the caller, because
// we don't want a logging glitch to break a clinician's AI request.
// =====================================================================
async function logAIUsage(params: {
  providerCode: string;
  providerName: string;
  modelCode: string;
  displayName: string;
  source: string;
  success: boolean;
  errorMessage?: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  userId?: string;
  tool?: string;
}) {
  try {
    await db.aIUsageLog.create({
      data: {
        providerCode: params.providerCode,
        providerName: params.providerName,
        modelCode: params.modelCode,
        displayName: params.displayName,
        source: params.source,
        success: params.success,
        errorMessage: params.errorMessage ? params.errorMessage.slice(0, 500) : null,
        latencyMs: params.latencyMs,
        promptTokens: params.promptTokens ?? null,
        completionTokens: params.completionTokens ?? null,
        totalTokens: params.totalTokens ?? null,
        userId: params.userId ?? null,
        tool: params.tool ?? null,
      },
    });
  } catch (e) {
    // Never fail the user's AI request because of a logging error
    console.error("[AI Service] Failed to log usage:", e);
  }
}

// =====================================================================
// CHAT COMPLETION — the main entry point for all AI features
// =====================================================================
export async function aiChat(
  systemPrompt: string,
  userMessage: string,
  opts?: AIChatOptions
): Promise<string> {
  const config = await resolveActiveAIConfig();

  if (config.source === "none") {
    // Still log the failed attempt for usage stats
    void logAIUsage({
      providerCode: config.providerCode,
      providerName: config.providerName,
      modelCode: config.modelCode,
      displayName: config.displayName,
      source: config.source,
      success: false,
      errorMessage: "AI is not configured",
      latencyMs: 0,
      userId: opts?.userId,
      tool: opts?.tool,
    });
    throw new Error(
      "AI is not configured. An administrator must set up AI Services in Administration → AI Services."
    );
  }

  const chatUrl = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  // Build request body — only include parameters supported by the model
  const body: any = {
    model: config.modelCode,
    messages: [
      { role: "assistant", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  };
  // Only add thinking if the model supports it
  if (config.supportsThinking) {
    body.thinking = { type: "disabled" };
  }
  if (config.temperature !== undefined) {
    body.temperature = config.temperature;
  }
  if (config.maxTokens !== undefined) {
    body.max_tokens = config.maxTokens;
  }

  const start = Date.now();
  let success = false;
  let errorMessage: string | undefined;
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let totalTokens: number | undefined;

  try {
    const resp = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(formatAIError(resp.status, errText));
    }

    const data = await resp.json();
    success = true;
    // Capture token usage if reported by the provider
    if (data?.usage) {
      promptTokens = data.usage.prompt_tokens ?? data.usage.promptTokens;
      completionTokens = data.usage.completion_tokens ?? data.usage.completionTokens;
      totalTokens = data.usage.total_tokens ?? data.usage.totalTokens;
    }
    return data.choices?.[0]?.message?.content || "";
  } catch (e: any) {
    errorMessage = e?.message;
    // Re-throw formatted errors
    if (e?.message?.includes("AI")) throw e;
    // Network errors
    throw new Error(
      "AI service is temporarily unavailable. Please check your internet connection and try again."
    );
  } finally {
    // Always log usage — even on failure — so the admin dashboard can
    // show error rates and latency trends.
    void logAIUsage({
      providerCode: config.providerCode,
      providerName: config.providerName,
      modelCode: config.modelCode,
      displayName: config.displayName,
      source: config.source,
      success,
      errorMessage,
      latencyMs: Date.now() - start,
      promptTokens,
      completionTokens,
      totalTokens,
      userId: opts?.userId,
      tool: opts?.tool,
    });
  }
}

export async function aiChatJSON(
  systemPrompt: string,
  userMessage: string,
  opts?: AIChatOptions
): Promise<any> {
  const enhancedPrompt = `${systemPrompt}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences, no additional text. Just the JSON object.`;
  const response = await aiChat(enhancedPrompt, userMessage, opts);
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
  const config = await resolveActiveAIConfig();
  return config.source !== "none";
}

// ── Legacy compat: resolveModel still works for old code ──────────
export function resolveModel(override?: string): string {
  return override || process.env.ZAI_MODEL || DEFAULT_ZAI_MODEL;
}
