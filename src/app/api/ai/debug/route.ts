// =====================================================================
// API: /api/ai/debug — tests the AI API connection (NO AUTH REQUIRED)
// =====================================================================
// Visit in browser:
//   /api/ai/debug                    → uses ZAI_MODEL env var (or DEFAULT_ZAI_MODEL)
//   /api/ai/debug?model=glm-4-plus   → tests with a specific model
//   /api/ai/debug?model=glm-4-flash  → tests glm-4-flash (expected to fail
//                                       on this account — see DEFAULT_ZAI_MODEL
//                                       comment in ai-service.ts)
// =====================================================================
import { NextResponse } from "next/server";
import { apiRouteConfig } from "@/lib/api-route-config";
// Canonical model default — imported here so this endpoint never drifts out
// of sync with the value used by the real AI service in production.
import { DEFAULT_ZAI_MODEL } from "@/lib/ai/ai-service";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const testModel = url.searchParams.get("model");

  const apiKey = process.env.ZAI_API_KEY;
  const baseUrl = process.env.ZAI_BASE_URL;
  const chatUrl = process.env.ZAI_CHAT_URL;
  const envModel = process.env.ZAI_MODEL || DEFAULT_ZAI_MODEL;
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

    // Decode common Z.ai error codes into actionable hints.
    const errCode = respJson?.error?.code ? String(respJson.error.code) : "";
    let diagnosis = "";
    if (!resp.ok) {
      if (resp.status === 429 || errCode === "1113") {
        diagnosis = "Model name is valid on this account, but the account has insufficient balance. Top up at https://z.ai billing.";
      } else if (resp.status === 400 && errCode === "1211") {
        diagnosis = "Model name is NOT recognized on this account's api.z.ai endpoint. Verified-valid model: glm-4-plus. (glm-4-flash is published on the Chinese open.bigmodel.cn but is not routable here.)";
      } else if (resp.status === 401 || errCode === "1001") {
        diagnosis = "Authentication failed. Check that ZAI_API_KEY is set correctly on Vercel.";
      }
    }

    const tip = resp.ok
      ? "✅ AI is working! Try the AI Assistant view."
      : !resp.ok && (resp.status === 429 || errCode === "1113")
        ? "❌ 429 = model is valid but account has no credits. Top up at https://z.ai — no model change will fix this until you add balance."
        : !resp.ok && (resp.status === 400 && errCode === "1211")
          ? "❌ 400 code 1211 = model name unknown on this api.z.ai account. The only verified-valid model is glm-4-plus — try /api/ai/debug?model=glm-4-plus"
          : "❌ Unrecognized error. Try /api/ai/debug?model=glm-4-plus  (the only verified-valid model on this account).";

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
        note: testModel ? `Testing with ?model=${testModel} (overrides ZAI_MODEL)` : "Using ZAI_MODEL env var (or DEFAULT_ZAI_MODEL)",
      },
      response: resp.ok
        ? { ok: true, content: respJson?.choices?.[0]?.message?.content || "(empty response)" }
        : { ok: false, error: respJson?.error || respText.slice(0, 500), diagnosis },
      tip,
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
