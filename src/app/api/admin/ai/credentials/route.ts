// =====================================================================
// API: /api/admin/ai/credentials
//   POST — create or update an AICredential for a provider
//   Permission: ai_config.manage
// =====================================================================
// Body: { providerId, apiKey, label? }
//
// Security:
//   - The plaintext API key is NEVER persisted. It is encrypted with
//     AES-256-GCM via encryptApiKey() before being written.
//   - The plaintext API key is NEVER returned in any response — only
//     { id, providerId, label, active, configured: true }.
//   - The plaintext API key is NEVER written to the audit log. The
//     audit log records only that a credential was set, with the
//     provider id and the optional label.
//
// Operation:
//   - Before creating a new active credential, any existing active
//     credential for the same provider is deactivated (active=false).
//     This keeps a single active key per provider (the resolver only
//     ever picks up an active credential).
//   - This endpoint does NOT delete old credentials — they remain in
//     the table as deactivated, available for forensic review.
//
// Audit log: AI_CREDENTIAL_UPDATED (category=ADMIN, severity=warning,
// source="ai_config"). Severity is "warning" because credential
// rotation is a security-sensitive event.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { encryptApiKey } from "@/lib/ai/crypto";
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

  const { providerId, apiKey, label } = body;

  // ── Validate required fields ──────────────────────────────────
  if (!providerId || typeof providerId !== "string") {
    return NextResponse.json({ error: "providerId is required" }, { status: 400 });
  }
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
  }
  if (apiKey.length < 8) {
    return NextResponse.json(
      { error: "apiKey looks too short — please check you have pasted the full key." },
      { status: 400 }
    );
  }

  // ── Provider must exist ───────────────────────────────────────
  const provider = await db.aIProvider.findUnique({ where: { id: providerId } });
  if (!provider) {
    return NextResponse.json(
      { error: "Provider not found", code: "PROVIDER_NOT_FOUND" },
      { status: 404 }
    );
  }

  // ── Encrypt the API key (AES-256-GCM) ────────────────────────
  // encryptApiKey returns { encrypted, iv, tag } all base64 — these
  // are stored verbatim in the credential row. The plaintext key
  // never touches the database.
  const encrypted = encryptApiKey(apiKey);

  // ── Deactivate any existing active credential for this provider ──
  await db.aICredential.updateMany({
    where: { providerId, active: true },
    data: { active: false },
  });

  // ── Create the new active credential ─────────────────────────
  const credential = await db.aICredential.create({
    data: {
      providerId,
      apiKeyEncrypted: encrypted.encrypted,
      apiKeyIv: encrypted.iv,
      apiKeyTag: encrypted.tag,
      label: label || null,
      active: true,
      createdById: session.user.id,
    },
    select: {
      id: true,
      providerId: true,
      label: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  clearAIConfigCache();

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "AI_CREDENTIAL_UPDATED",
    actionCategory: "ADMIN",
    severity: "warning", // security-sensitive — credential rotation
    source: "ai_config",
    resourceType: "ai_credential",
    resourceId: credential.id,
    newValues: {
      providerId,
      label: label || null,
      // DELIBERATELY NOT logging apiKey, apiKeyEncrypted, iv, or tag.
      active: true,
    },
    reason: "AI provider credential set/rotated",
  });

  // ── NEVER return the API key in the response ──────────────────
  return NextResponse.json(
    {
      item: {
        ...credential,
        configured: true,
      },
    },
    { status: 201 }
  );
}
