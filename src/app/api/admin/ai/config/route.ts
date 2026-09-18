// =====================================================================
// API: /api/admin/ai/config
//   GET — returns the current resolved AI config (masked, no API key)
//         plus the list of all providers with their models + the
//         "configured" status of each provider's active credential.
//   Permission: ai_config.view
// =====================================================================
// This endpoint NEVER returns decrypted API keys. The masked-key
// representation (`81b2a9...agmq (len=49)`) is the most an admin can
// see in the UI — sufficient for "is the right key configured?" checks
// without ever exposing the credential itself.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { resolveActiveAIConfig } from "@/lib/ai/ai-service";
import { maskApiKey, decryptApiKey } from "@/lib/ai/crypto";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.AI_CONFIG_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── 1. Resolved active config (masked, no API key) ─────────────
  const activeConfig = await resolveActiveAIConfig();

  // Compute a masked preview of the resolved API key. We mask the
  // decrypted key (not the encrypted fields) so the admin can compare
  // against their provider dashboard without ever seeing the full key.
  let activeKeyMasked: string | null = null;
  if (activeConfig.source === "database" && activeConfig.apiKey) {
    activeKeyMasked = maskApiKey(activeConfig.apiKey);
  } else if (activeConfig.source === "environment" && process.env.ZAI_API_KEY) {
    activeKeyMasked = maskApiKey(process.env.ZAI_API_KEY);
  }

  const active = {
    source: activeConfig.source, // database | environment | none
    providerCode: activeConfig.providerCode,
    providerName: activeConfig.providerName,
    baseUrl: activeConfig.baseUrl,
    modelCode: activeConfig.modelCode,
    displayName: activeConfig.displayName,
    supportsThinking: activeConfig.supportsThinking,
    supportsVision: activeConfig.supportsVision,
    supportsTools: activeConfig.supportsTools,
    temperature: activeConfig.temperature ?? null,
    maxTokens: activeConfig.maxTokens ?? null,
    apiKeyMasked: activeKeyMasked,
    configured: activeConfig.source !== "none",
  };

  // ── 2. All providers + their models + credential status ────────
  const providers = await db.aIProvider.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      models: {
        orderBy: [{ defaultForProvider: "desc" }, { displayName: "asc" }],
      },
      credentials: {
        where: { active: true },
        take: 1,
        select: {
          id: true,
          label: true,
          active: true,
          apiKeyEncrypted: true,
          apiKeyIv: true,
          apiKeyTag: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  const providersPayload = providers.map((p) => {
    const cred = p.credentials[0] || null;
    let credMasked: string | null = null;
    let credDecryptable = false;
    if (cred) {
      const decrypted = decryptApiKey(cred.apiKeyEncrypted, cred.apiKeyIv, cred.apiKeyTag);
      if (decrypted) {
        credMasked = maskApiKey(decrypted);
        credDecryptable = true;
      } else {
        credMasked = "Undecryptable (NEXTAUTH_SECRET changed?)";
      }
    }
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      baseUrl: p.baseUrl,
      providerType: p.providerType,
      active: p.active,
      isDefault: p.isDefault,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      credential: cred
        ? {
            id: cred.id,
            label: cred.label,
            active: cred.active,
            configured: true,
            decryptable: credDecryptable,
            apiKeyMasked: credMasked,
            createdAt: cred.createdAt,
            updatedAt: cred.updatedAt,
          }
        : null,
      models: p.models.map((m) => ({
        id: m.id,
        modelCode: m.modelCode,
        displayName: m.displayName,
        description: m.description,
        active: m.active,
        defaultForProvider: m.defaultForProvider,
        supportsStreaming: m.supportsStreaming,
        supportsVision: m.supportsVision,
        supportsTools: m.supportsTools,
        supportsThinking: m.supportsThinking,
        temperatureDefault: m.temperatureDefault,
        maxTokensDefault: m.maxTokensDefault,
        contextWindow: m.contextWindow,
        pricingType: m.pricingType,
        notes: m.notes,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
    };
  });

  return NextResponse.json({
    active,
    providers: providersPayload,
    totalProviders: providersPayload.length,
    totalModels: providersPayload.reduce((n, p) => n + p.models.length, 0),
  });
}
