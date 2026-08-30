// =====================================================================
// API: /api/nhia-claims/export
//   POST — Generate XML and export (file download or bridge submission)
// =====================================================================
import { NextResponse } from "next/server";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { generateAndExportClaim } from "@/integrations/nhia/claim-it";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_CLAIM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { encounterId, transportMode, skipValidation } = body;
  if (!encounterId) return NextResponse.json({ error: "encounterId is required" }, { status: 400 });

  try {
    const result = await generateAndExportClaim(encounterId, session.user.organizationId, {
      transportMode,
      skipValidation,
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "NHIA_CLAIM_EXPORTED",
      resourceType: "encounter",
      resourceId: encounterId,
      newValues: {
        valid: result.validation.valid,
        claimRef: result.ico.header.claimNumber,
        exportSuccess: result.exportResult?.success || false,
        errorCount: result.validation.errors.length,
      },
    });

    if (!result.validation.valid) {
      return NextResponse.json({
        error: "Claim validation failed. Fix errors before exporting.",
        validation: result.validation,
        ico: result.ico,
      }, { status: 422 });
    }

    // Return XML as downloadable content
    if (result.xml) {
      return new NextResponse(result.xml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="${result.ico.header.claimNumber}.xml"`,
        },
      });
    }

    return NextResponse.json({
      error: "XML generation failed",
      validation: result.validation,
    }, { status: 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to export claim" }, { status: 500 });
  }
}
