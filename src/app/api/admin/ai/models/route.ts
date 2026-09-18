// =====================================================================
// API: /api/admin/ai/models
//   POST — create a new AIModel
//   Permission: ai_config.manage
// =====================================================================
// Body: { providerId, modelCode, displayName, description?, pricingType?,
//         supportsThinking?, supportsVision?, supportsTools?,
//         supportsStreaming?, temperatureDefault?, maxTokensDefault?,
//         contextWindow?, notes? }
//
// Audit log: AI_MODEL_CREATED (category=ADMIN, severity=notice,
// source="ai_config")
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { clearAIConfigCache } from "@/lib/ai/ai-service";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.AI_CONFIG_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const {
    providerId, modelCode, displayName, description,
    pricingType, supportsThinking, supportsVision, supportsTools,
    supportsStreaming, temperatureDefault, maxTokensDefault,
    contextWindow, notes,
  } = body;

  // ── Validate required fields ──────────────────────────────────
  if (!providerId || typeof providerId !== "string") {
    return NextResponse.json({ error: "providerId is required" }, { status: 400 });
  }
  if (!modelCode || typeof modelCode !== "string" || !modelCode.trim()) {
    return NextResponse.json({ error: "modelCode is required" }, { status: 400 });
  }
  if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  // ── Provider must exist ───────────────────────────────────────
  const provider = await db.aIProvider.findUnique({ where: { id: providerId } });
  if (!provider) {
    return NextResponse.json(
      { error: "Provider not found", code: "PROVIDER_NOT_FOUND" },
      { status: 404 }
    );
  }

  // ── Enforce (providerId, modelCode) uniqueness ────────────────
  const dup = await db.aIModel.findUnique({
    where: { providerId_modelCode: { providerId, modelCode: modelCode.trim() } },
  });
  if (dup) {
    return NextResponse.json(
      {
        error: `Model "${modelCode.trim()}" already exists for this provider.`,
        code: "DUPLICATE_MODEL_CODE",
      },
      { status: 409 }
    );
  }

  // Parse optional numeric fields safely
  const tempVal = temperatureDefault !== undefined && temperatureDefault !== null && temperatureDefault !== ""
    ? parseFloat(temperatureDefault)
    : null;
  const maxTokVal = maxTokensDefault !== undefined && maxTokensDefault !== null && maxTokensDefault !== ""
    ? parseInt(maxTokensDefault, 10)
    : null;
  const ctxVal = contextWindow !== undefined && contextWindow !== null && contextWindow !== ""
    ? parseInt(contextWindow, 10)
    : null;

  if (tempVal !== null && (isNaN(tempVal) || tempVal < 0 || tempVal > 2)) {
    return NextResponse.json(
      { error: "temperatureDefault must be a number between 0.0 and 2.0" },
      { status: 400 }
    );
  }
  if (maxTokVal !== null && (isNaN(maxTokVal) || maxTokVal < 1)) {
    return NextResponse.json({ error: "maxTokensDefault must be a positive integer" }, { status: 400 });
  }
  if (ctxVal !== null && (isNaN(ctxVal) || ctxVal < 1)) {
    return NextResponse.json({ error: "contextWindow must be a positive integer" }, { status: 400 });
  }

  const model = await db.aIModel.create({
    data: {
      providerId,
      modelCode: modelCode.trim(),
      displayName: displayName.trim(),
      description: description || null,
      active: true,
      defaultForProvider: false,
      supportsStreaming: !!supportsStreaming,
      supportsVision: !!supportsVision,
      supportsTools: !!supportsTools,
      supportsThinking: !!supportsThinking,
      temperatureDefault: tempVal,
      maxTokensDefault: maxTokVal,
      contextWindow: ctxVal,
      pricingType: pricingType || "paid",
      notes: notes || null,
      createdById: session.user.id,
    },
  });

  clearAIConfigCache();

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "AI_MODEL_CREATED",
    actionCategory: "ADMIN",
    severity: "notice",
    source: "ai_config",
    resourceType: "ai_model",
    resourceId: model.id,
    newValues: {
      providerId,
      modelCode: model.modelCode,
      displayName: model.displayName,
      pricingType: model.pricingType,
      supportsStreaming: model.supportsStreaming,
      supportsVision: model.supportsVision,
      supportsTools: model.supportsTools,
      supportsThinking: model.supportsThinking,
    },
  });

  return NextResponse.json({ item: model }, { status: 201 });
}
