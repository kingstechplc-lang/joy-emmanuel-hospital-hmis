// =====================================================================
// API: /api/ai/debug — tests the AI API connection (NO AUTH REQUIRED)
// =====================================================================
// Visit in browser:
//   /api/ai/debug                    → uses ZAI_MODEL env var (or default)
//   /api/ai/debug?model=glm-4-plus   → tests with a specific model
//   /api/ai/debug?model=glm-4-flash  → tests glm-4-flash
// =====================================================================
import { NextResponse } from "next/server";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const testModel = url.searchParams.get("model");

  const apiKey = process.env.ZAI_API_KEY;
  const baseUrl = process.env.ZAI_BASE_URL;
  const chatUrl = process.env.ZAI_CHAT_URL;
  const envModel = process.env.ZAI_MODEL || "glm-4-flash";
  const model = testModel || envModel;

  // Mask the API key for display
  const maskedKey = apiKey
    ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)} (len=${apiKey.length})`
    : "NOT SET";

  // Construct the URL
  let apiUrl = chatUrl;
  if (!apiUrl && baseUrl) {
    apiUrl = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  }

  if (!apiKey || !apiUrl) {
    return NextResponse.json({
      status: "not_configured",
      message: "Missing env vars. Set ZAI_API_KEY + ZAI_BASE_URL (or ZAI_CHAT_URL) on Vercel.",
      config: {
        ZAI_API_KEY: maskedKey,
        ZAI_BASE_URL: baseUrl || "NOT SET",
        ZAI_CHAT_URL: chatUrl || "NOT SET",
        ZAI_MODEL: envModel,
      },
    });
  }

  // Test a simple API call with the specified model
  try {
    const testBody = {
      model,
      messages: [
        { role: "user", content: "Say 'hello' in one word." },
      ],
    };

    console.log("[AI Debug] testing:", { url: apiUrl, model, body: JSON.stringify(testBody) });

    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(testBody),
    });

    const respText = await resp.text();
    let respJson: any = null;
    try { respJson = JSON.parse(respText); } catch {}

    return NextResponse.json({
      status: resp.ok ? "ok" : "error",
      httpStatus: resp.status,
      model: model,
      apiUrl: apiUrl,
      config: {
        ZAI_API_KEY: maskedKey,
        ZAI_BASE_URL: baseUrl || "NOT SET",
        ZAI_CHAT_URL: chatUrl || "NOT SET",
        ZAI_MODEL: envModel,
        testingModel: model,
        note: testModel ? `Testing with ?model=${testModel} (overrides ZAI_MODEL)` : "Using ZAI_MODEL env var",
      },
      response: resp.ok
        ? { ok: true, content: respJson?.choices?.[0]?.message?.content || "(empty response)" }
        : { ok: false, error: respJson?.error || respText.slice(0, 500) },
      tip: resp.ok
        ? "✅ AI is working! Try the AI Assistant view."
        : "❌ Try: /api/ai/debug?model=glm-4-plus  or  /api/ai/debug?model=glm-4  or  /api/ai/debug?model=chatglm_turbo",
    });
  } catch (e: any) {
    return NextResponse.json({
      status: "error",
      message: e?.message || String(e),
      config: {
        ZAI_API_KEY: maskedKey,
        ZAI_BASE_URL: baseUrl || "NOT SET",
        ZAI_CHAT_URL: chatUrl || "NOT SET",
        ZAI_MODEL: envModel,
        testingModel: model,
        apiUrl: apiUrl,
      },
    });
  }
}
