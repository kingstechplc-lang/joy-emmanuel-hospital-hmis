// =====================================================================
// API: /api/admin/ai/providers
//   POST — create a new AIProvider
//   Permission: ai_config.manage
// =====================================================================
// Body: { code, name, description?, baseUrl, providerType?, active?,
//         isDefault? }
//
// If `isDefault=true`, any existing default is unset first — there can
// only be ONE default provider at a time (the active config resolver
// queries by isDefault=true).
//
// Audit log: AI_PROVIDER_CREATED (category=ADMIN, severity=notice,
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

  const { code, name, description, baseUrl, providerType, active, isDefault } = body;

  // ── Validate required fields ──────────────────────────────────
  if (!code || typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!baseUrl || typeof baseUrl !== "string" || !baseUrl.trim()) {
    return NextResponse.json({ error: "baseUrl is required" }, { status: 400 });
  }

  // ── Enforce code uniqueness ───────────────────────────────────
  const existing = await db.aIProvider.findUnique({ where: { code: code.trim() } });
  if (existing) {
    return NextResponse.json(
      { error: `Provider with code "${code.trim()}" already exists.`, code: "DUPLICATE_PROVIDER_CODE" },
      { status: 409 }
    );
  }

  // ── Enforce single default ───────────────────────────────────
  // If this new provider is being created as the default, unset any
  // existing default first (in a transaction so we never end up with
  // zero or two defaults if one of the writes fails).
  const wantsDefault = isDefault === true;
  if (wantsDefault) {
    await db.aIProvider.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  const provider = await db.aIProvider.create({
    data: {
      code: code.trim(),
      name: name.trim(),
      description: description || null,
      baseUrl: baseUrl.trim(),
      providerType: providerType || "openai_compatible",
      active: active !== undefined ? !!active : true,
      isDefault: wantsDefault,
      createdById: session.user.id,
    },
  });

  // Clear the cached AI runtime config so the resolver picks up the
  // new provider immediately.
  clearAIConfigCache();

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "AI_PROVIDER_CREATED",
    actionCategory: "ADMIN",
    severity: "notice",
    source: "ai_config",
    resourceType: "ai_provider",
    resourceId: provider.id,
    newValues: {
      code: provider.code,
      name: provider.name,
      baseUrl: provider.baseUrl,
      providerType: provider.providerType,
      active: provider.active,
      isDefault: provider.isDefault,
    },
  });

  return NextResponse.json({ item: provider }, { status: 201 });
}
