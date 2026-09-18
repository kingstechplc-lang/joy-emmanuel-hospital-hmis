// =====================================================================
// API: /api/admin/ai/providers/[id]
//   PATCH — update an AIProvider (name, description, baseUrl,
//           providerType, active, isDefault)
//   Permission: ai_config.manage
// =====================================================================
// Special rules:
//   - If setting `isDefault=true`, unset other defaults first.
//   - If setting `active=false` on the *current default* provider,
//     block the change with 400 "Cannot deactivate the default provider"
//     (otherwise the resolver would have no default to pick).
//
// Audit log: AI_PROVIDER_UPDATED (category=ADMIN, severity=notice,
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

  const existing = await db.aIProvider.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { name, description, baseUrl, providerType, active, isDefault } = body;

  // ── Rule: cannot deactivate the default provider ──────────────
  // Without an active default, resolveActiveAIConfig() would fall
  // through to env vars — which would silently bypass the admin's
  // database configuration. Force the admin to either pick a different
  // default first, or delete the credentials if they really want to
  // disable this provider entirely.
  if (active === false && existing.isDefault) {
    return NextResponse.json(
      {
        error: "Cannot deactivate the default provider. Set another provider as default first, then deactivate this one.",
        code: "CANNOT_DEACTIVATE_DEFAULT",
      },
      { status: 400 }
    );
  }

  // ── Rule: if making this the new default, unset other defaults ──
  if (isDefault === true && !existing.isDefault) {
    await db.aIProvider.updateMany({
      where: { isDefault: true, NOT: { id } },
      data: { isDefault: false },
    });
  }

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description || null;
  if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
  if (providerType !== undefined) updateData.providerType = providerType;
  if (active !== undefined) updateData.active = !!active;
  if (isDefault !== undefined) updateData.isDefault = !!isDefault;

  const updated = await db.aIProvider.update({
    where: { id },
    data: updateData,
  });

  clearAIConfigCache();

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "AI_PROVIDER_UPDATED",
    actionCategory: "ADMIN",
    severity: "notice",
    source: "ai_config",
    resourceType: "ai_provider",
    resourceId: id,
    oldValues: {
      name: existing.name,
      description: existing.description,
      baseUrl: existing.baseUrl,
      providerType: existing.providerType,
      active: existing.active,
      isDefault: existing.isDefault,
    },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}
