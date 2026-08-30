// =====================================================================
// API: /api/nhia-claims/validate
//   POST — dry-run validation. Builds the ICO and runs the validator
//          WITHOUT generating XML or persisting anything.
//   Returns: { ico, validation, warnings }
//   Use this to preview issues before triggering the full generation.
// =====================================================================
import { NextResponse } from "next/server";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { buildICOFromEncounter, validateICO } from "@/integrations/nhia/claim-it";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NHIA_CLAIM_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { encounterId } = body;
  if (!encounterId) {
    return NextResponse.json({ error: "encounterId is required" }, { status: 400 });
  }

  let ico: any;
  let warnings: string[] = [];
  try {
    ({ ico, warnings } = await buildICOFromEncounter(encounterId, session.user.organizationId));
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e?.message || "ICO build failed",
        ico: null,
        validation: { valid: false, errors: [], warnings: [] },
        warnings: [],
      },
      { status: 500 },
    );
  }

  const validation = validateICO(ico);

  return NextResponse.json({
    ico,
    validation,
    warnings,
  });
}
