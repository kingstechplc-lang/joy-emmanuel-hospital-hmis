// =====================================================================
// API: /api/admin/ai/test — test an AI model with a minimal non-PHI request
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog, getClientIp } from "@/lib/session";
import { decryptApiKey } from "@/lib/ai/crypto";
import { formatAIError, clearAIConfigCache } from "@/lib/ai/ai-service";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "ai_config.manage"))
    return NextResponse.json({ error: "Forbidden — requires ai_config.manage" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { providerId, modelId } = body;
  if (!providerId) return NextResponse.json({ error: "providerId is required" }, { status: 400 });

  try {
    // Fetch provider + model + credential
    const provider = await db.aIProvider.findUnique({
      where: { id: providerId },
      include: {
        models: modelId
          ? { where: { id: modelId }, take: 1 }
          : { where: { active: true, defaultForProvider: true }, take: 1 },
        credentials: { where: { active: true }, take: 1 },
      },
    });

    if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    if (!provider.models.length) return NextResponse.json({ error: "No model found to test" }, { status: 400 });
    if (!provider.credentials.length) return NextResponse.json({ error: "No API key configured for this provider" }, { status: 400 });

    const model = provider.models[0];
    const cred = provider.credentials[0];
    const apiKey = decryptApiKey(cred.apiKeyEncrypted, cred.apiKeyIv, cred.apiKeyTag);
    if (!apiKey) return NextResponse.json({ error: "Failed to decrypt API key" }, { status: 500 });

    // Construct the test URL
    const chatUrl = `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const testBody: any = {
      model: model.modelCode,
      messages: [{ role: "user", content: "Reply with exactly: AI_MODEL_TEST_OK" }],
    };
    // Only add thinking if the model supports it
    if (model.supportsThinking) {
      testBody.thinking = { type: "disabled" };
    }

    const startTime = Date.now();

    // Send the test request with a 20-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    let resp: Response;
    try {
      resp = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(testBody),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      const status = "timeout";
      const errMsg = fetchErr?.name === "AbortError" ? "Request timed out after 20s" : (fetchErr?.message || "Network error");

      // Record the failed test
      try {
        await db.aIModelTestRun.create({
          data: {
            modelId: model.id,
            providerId: provider.id,
            status,
            httpStatus: null,
            errorMessage: errMsg,
            latencyMs: Date.now() - startTime,
            responsePreview: null,
            testedById: session.user.id,
          },
        });
      } catch {}

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        action: "AI_MODEL_TESTED",
        actionCategory: "ADMIN",
        severity: "warning",
        source: "ai_config",
        resourceType: "ai_model",
        resourceId: model.id,
        newValues: { provider: provider.code, model: model.modelCode, status, error: errMsg },
        ipAddress: getClientIp(req) || undefined,
      });

      clearAIConfigCache();
      return NextResponse.json({ status, errorMessage: errMsg, latencyMs: Date.now() - startTime });
    }
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;
    const respText = await resp.text();
    let respJson: any = null;
    try { respJson = JSON.parse(respText); } catch {}

    // Determine the test status
    let status: string;
    if (resp.ok) {
      status = "ok";
    } else if (resp.status === 400) {
      const code = respJson?.error?.code || "";
      if (code === "1211") status = "model_not_found";
      else status = "unknown_error";
    } else if (resp.status === 401) {
      status = "auth_failed";
    } else if (resp.status === 429) {
      const code = respJson?.error?.code || "";
      status = code === "1113" ? "insufficient_balance" : "rate_limited";
    } else if (resp.status >= 500) {
      status = "provider_unavailable";
    } else {
      status = "unknown_error";
    }

    const responsePreview = resp.ok
      ? (respJson?.choices?.[0]?.message?.content || "").slice(0, 100)
      : null;
    const errorMessage = resp.ok ? null : formatAIError(resp.status, respText);

    // Record the test result
    try {
      await db.aIModelTestRun.create({
        data: {
          modelId: model.id,
          providerId: provider.id,
          status,
          httpStatus: resp.status,
          errorMessage,
          latencyMs,
          responsePreview,
          testedById: session.user.id,
        },
      });
    } catch {}

    // Audit log
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "AI_MODEL_TESTED",
      actionCategory: "ADMIN",
      severity: resp.ok ? "info" : "warning",
      source: "ai_config",
      resourceType: "ai_model",
      resourceId: model.id,
      newValues: { provider: provider.code, model: model.modelCode, status, latencyMs },
      ipAddress: getClientIp(req) || undefined,
    });

    clearAIConfigCache();

    return NextResponse.json({
      status,
      httpStatus: resp.status,
      latencyMs,
      responsePreview,
      errorMessage,
    });
  } catch (e: any) {
    console.error("[POST /api/admin/ai/test] error:", e);
    return NextResponse.json({ error: e?.message || "Test failed" }, { status: 500 });
  }
}
