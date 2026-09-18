// =====================================================================
// API: /api/admin/ai/models/[id]
//   PATCH — update an AIModel (all fields, active, defaultForProvider)
//   Permission: ai_config.manage
// =====================================================================
// Special rules:
//   - If setting `defaultForProvider=true`, unset other defaults for
//     the same provider first (only one default per provider).
//   - If setting `active=false` on the *current default* model,
//     block the change with 400 "Cannot deactivate the default model"
//     (otherwise the resolver would have no default for this provider).
//
// Audit log: AI_MODEL_UPDATED (category=ADMIN, severity=notice,
// source="ai_config")
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { clearAIConfigCache } from "@/lib/ai/ai-service";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.AI_CONFIG_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const existing = await db.aIModel.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const {
    modelCode, displayName, description,
    pricingType, supportsThinking, supportsVision, supportsTools,
    supportsStreaming, temperatureDefault, maxTokensDefault,
    contextWindow, notes, active, defaultForProvider,
  } = body;

  // ── Rule: cannot deactivate the default model ─────────────────
  if (active === false && existing.defaultForProvider) {
    return NextResponse.json(
      {
        error: "Cannot deactivate the default model. Set another model as default for this provider first.",
        code: "CANNOT_DEACTIVATE_DEFAULT_MODEL",
      },
      { status: 400 }
    );
  }

  // ── Rule: if making this the new default, unset other defaults ──
  if (defaultForProvider === true && !existing.defaultForProvider) {
    await db.aIModel.updateMany({
      where: { providerId: existing.providerId, defaultForProvider: true, NOT: { id } },
      data: { defaultForProvider: false },
    });
  }

  const updateData: any = {};
  if (modelCode !== undefined) updateData.modelCode = modelCode;
  if (displayName !== undefined) updateData.displayName = displayName;
  if (description !== undefined) updateData.description = description || null;
  if (pricingType !== undefined) updateData.pricingType = pricingType;
  if (supportsThinking !== undefined) updateData.supportsThinking = !!supportsThinking;
  if (supportsVision !== undefined) updateData.supportsVision = !!supportsVision;
  if (supportsTools !== undefined) updateData.supportsTools = !!supportsTools;
  if (supportsStreaming !== undefined) updateData.supportsStreaming = !!supportsStreaming;
  if (temperatureDefault !== undefined) {
    updateData.temperatureDefault =
      temperatureDefault === null || temperatureDefault === ""
        ? null
        : parseFloat(temperatureDefault);
  }
  if (maxTokensDefault !== undefined) {
    updateData.maxTokensDefault =
      maxTokensDefault === null || maxTokensDefault === ""
        ? null
        : parseInt(maxTokensDefault, 10);
  }
  if (contextWindow !== undefined) {
    updateData.contextWindow =
      contextWindow === null || contextWindow === ""
        ? null
        : parseInt(contextWindow, 10);
  }
  if (notes !== undefined) updateData.notes = notes || null;
  if (active !== undefined) updateData.active = !!active;
  if (defaultForProvider !== undefined) updateData.defaultForProvider = !!defaultForProvider;

  const updated = await db.aIModel.update({
    where: { id },
    data: updateData,
  });

  clearAIConfigCache();

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "AI_MODEL_UPDATED",
    actionCategory: "ADMIN",
    severity: "notice",
    source: "ai_config",
    resourceType: "ai_model",
    resourceId: id,
    oldValues: {
      modelCode: existing.modelCode,
      displayName: existing.displayName,
      pricingType: existing.pricingType,
      active: existing.active,
      defaultForProvider: existing.defaultForProvider,
      supportsThinking: existing.supportsThinking,
      supportsVision: existing.supportsVision,
      supportsTools: existing.supportsTools,
      supportsStreaming: existing.supportsStreaming,
    },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}
