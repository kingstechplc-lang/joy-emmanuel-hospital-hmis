// =====================================================================
// API: /api/nhia-claims/preview
//   POST — Build ICO from encounter, validate, return preview (no export)
// =====================================================================
import { NextResponse } from "next/server";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { buildICOFromEncounter, validateICO, serializeNHIAClaim } from "@/integrations/nhia/claim-it";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_CLAIM) && !hasPermission(session, PERMISSIONS.BILLING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { encounterId } = body;
  if (!encounterId) return NextResponse.json({ error: "encounterId is required" }, { status: 400 });

  try {
    const { ico, warnings } = await buildICOFromEncounter(encounterId, session.user.organizationId);
    const validation = validateICO(ico);
    const xml = validation.valid ? serializeNHIAClaim(ico) : null;

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "NHIA_CLAIM_PREVIEW",
      resourceType: "encounter",
      resourceId: encounterId,
      newValues: { valid: validation.valid, errorCount: validation.errors.length, warningCount: validation.warnings.length },
    });

    return NextResponse.json({
      ico,
      validation,
      xml,
      warnings,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate claim preview" }, { status: 500 });
  }
}
