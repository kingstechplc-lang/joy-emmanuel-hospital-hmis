// =====================================================================
// API: /api/ai/debug — tests the AI API connection + shows config
// =====================================================================
// GET — returns the current AI configuration (without revealing the
//       full API key) + tests a simple API call.
// =====================================================================
import { NextResponse } from "next/server";
import { getSession, hasPermission } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "clinical.view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.ZAI_API_KEY;
  const baseUrl = process.env.ZAI_BASE_URL;
  const chatUrl = process.env.ZAI_CHAT_URL;
  const model = process.env.ZAI_MODEL || "glm-4";

  // Mask the API key for display (show first 8 + last 4 chars)
  const maskedKey = apiKey
    ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)} (length: ${apiKey.length})`
    : "NOT SET";

  // Construct the URL that would be used
  let url = chatUrl;
  if (!url && baseUrl) {
    url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  }

  // If no API key, return config status only
  if (!apiKey) {
    return NextResponse.json({
      status: "not_configured",
      message: "ZAI_API_KEY is not set. Set it on Vercel → Settings → Environment Variables.",
      config: { ZAI_API_KEY: "NOT SET", ZAI_BASE_URL: baseUrl || "NOT SET", ZAI_CHAT_URL: chatUrl || "NOT SET", ZAI_MODEL: model },
    });
  }

  // Try a simple test call to the API
  try {
    const testUrl = url;
    console.log("[AI Debug] testing URL:", testUrl);

    const resp = await fetch(testUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Z-AI-From": "Z",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "assistant", content: "You are a helpful assistant." },
          { role: "user", content: "Say 'AI is working' in exactly 3 words." },
        ],
        thinking: { type: "disabled" },
      }),
    });

    const respText = await resp.text();
    let respJson: any = null;
    try { respJson = JSON.parse(respText); } catch {}

    return NextResponse.json({
      status: resp.ok ? "ok" : "error",
      httpStatus: resp.status,
      config: {
        ZAI_API_KEY: maskedKey,
        ZAI_BASE_URL: baseUrl || "NOT SET",
        ZAI_CHAT_URL: chatUrl || "NOT SET",
        ZAI_MODEL: model,
        constructedUrl: testUrl,
      },
      response: resp.ok
        ? { ok: true, content: respJson?.choices?.[0]?.message?.content || "(empty)" }
        : { ok: false, body: respText.slice(0, 500) },
    });
  } catch (e: any) {
    return NextResponse.json({
      status: "error",
      message: e?.message || String(e),
      config: {
        ZAI_API_KEY: maskedKey,
        ZAI_BASE_URL: baseUrl || "NOT SET",
        ZAI_CHAT_URL: chatUrl || "NOT SET",
        ZAI_MODEL: model,
        constructedUrl: url,
      },
    });
  }
}
