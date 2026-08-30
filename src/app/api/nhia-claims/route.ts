// =====================================================================
// API: /api/nhia-claims
//   GET  — list XML generation history (filter by facility, status, period)
//   POST — generate XML from an encounter (full pipeline: build → validate → serialize → export)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { generateAndExportClaim } from "@/integrations/nhia/claim-it";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/nhia-claims?facilityId=...&status=...&period=2026-08&limit=100
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NHIA_CLAIM_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const period = url.searchParams.get("period");
  const encounterId = url.searchParams.get("encounterId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (period) where.submissionPeriod = period;
  if (encounterId) where.encounterId = encounterId;

  const exports = await db.nhiaClaimExport.findMany({
    where,
    orderBy: { generatedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ items: exports, count: exports.length });
}

// POST /api/nhia-claims
// body: { encounterId, facilityId?, transportMode?: "file"|"bridge", skipValidation?: boolean, persist?: boolean }
// Returns: { item, ico, validation, warnings, xml }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NHIA_CLAIM_GENERATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { encounterId, transportMode, skipValidation = false, persist = true } = body;
  if (!encounterId) {
    return NextResponse.json({ error: "encounterId is required" }, { status: 400 });
  }

  // Run the full pipeline
  let result: any;
  try {
    result = await generateAndExportClaim(encounterId, session.user.organizationId, {
      transportMode,
      skipValidation,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e?.message || "Claim generation failed",
        ico: null,
        validation: null,
        xml: null,
      },
      { status: 500 },
    );
  }

  const { ico, validation, xml, exportResult, warnings } = result;

  // Persist the generation record (default ON — set persist=false for dry-run)
  let exportRecord: any = null;
  if (persist) {
    try {
      const facilityId = ico.facility?.facilityId || null;
      const patientId = ico.patient?.internalPatientId || null;

      // Look up patient name + insurance claim id
      let patientName: string | null = null;
      if (patientName === null && ico.patient) {
        patientName = `${ico.patient.surname || ""} ${ico.patient.otherNames || ""}`.trim();
      }

      const claimNumber = ico.header.claimNumber;
      const xmlSize = xml ? Buffer.byteLength(xml, "utf8") : null;

      // Determine final status
      let finalStatus: string;
      if (!validation.valid) {
        finalStatus = "failed";
      } else if (exportResult?.success) {
        finalStatus = "exported";
      } else if (xml) {
        finalStatus = "xml_generated";
      } else {
        finalStatus = "validated";
      }

      // Upsert — if a record already exists for this encounter, refresh it
      // (handles re-generation scenarios cleanly)
      exportRecord = await db.nhiaClaimExport.upsert({
        where: { claimNumber },
        create: {
          organizationId: session.user.organizationId,
          facilityId,
          encounterId,
          patientId,
          patientName,
          invoiceId: ico.metadata?.invoiceId || null,
          insuranceClaimId: ico.metadata?.insuranceClaimId || null,
          claimNumber,
          batchRef: ico.header?.batchRef || null,
          submissionPeriod: ico.header?.submissionPeriod || null,
          status: finalStatus,
          isValid: validation.valid,
          errorCount: validation.errors.length,
          warningCount: validation.warnings.length,
          validationErrors: JSON.stringify(validation.errors),
          adapterWarnings: JSON.stringify(warnings),
          totalServiceAmount: ico.totals?.totalServiceAmount || 0,
          totalDrugAmount: ico.totals?.totalDrugAmount || 0,
          grossAmount: ico.totals?.grossAmount || 0,
          nhisAmount: ico.totals?.nhisAmount || 0,
          patientAmount: ico.totals?.patientAmount || 0,
          netAmount: ico.totals?.netAmount || 0,
          itemCount: (ico.services?.length || 0) + (ico.drugs?.length || 0),
          diagnosisCount: ico.diagnoses?.length || 0,
          xmlPayload: xml,
          xmlSizeBytes: xmlSize,
          transportMode: transportMode || process.env.NHIA_CLAIMIT_TRANSPORT || "file",
          filePath: exportResult?.filePath || null,
          submissionRef: exportResult?.submissionRef || null,
          transportError: exportResult && !exportResult.success
            ? (exportResult.errors[0]?.message || null)
            : null,
          generatedById: session.user.id,
          generatedByName: session.user.name || session.user.username,
          generatedAt: new Date(),
        },
        update: {
          status: finalStatus,
          isValid: validation.valid,
          errorCount: validation.errors.length,
          warningCount: validation.warnings.length,
          validationErrors: JSON.stringify(validation.errors),
          adapterWarnings: JSON.stringify(warnings),
          totalServiceAmount: ico.totals?.totalServiceAmount || 0,
          totalDrugAmount: ico.totals?.totalDrugAmount || 0,
          grossAmount: ico.totals?.grossAmount || 0,
          nhisAmount: ico.totals?.nhisAmount || 0,
          patientAmount: ico.totals?.patientAmount || 0,
          netAmount: ico.totals?.netAmount || 0,
          itemCount: (ico.services?.length || 0) + (ico.drugs?.length || 0),
          diagnosisCount: ico.diagnoses?.length || 0,
          xmlPayload: xml,
          xmlSizeBytes: xmlSize,
          transportMode: transportMode || process.env.NHIA_CLAIMIT_TRANSPORT || "file",
          filePath: exportResult?.filePath || null,
          submissionRef: exportResult?.submissionRef || null,
          transportError: exportResult && !exportResult.success
            ? (exportResult.errors[0]?.message || null)
            : null,
          generatedById: session.user.id,
          generatedByName: session.user.name || session.user.username,
          generatedAt: new Date(),
        },
      });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId,
        action: "NHIA_CLAIM_GENERATED",
        resourceType: "nhia_claim_export",
        resourceId: exportRecord.id,
        newValues: {
          claimNumber,
          encounterId,
          valid: validation.valid,
          errorCount: validation.errors.length,
          warningCount: validation.warnings.length,
          xmlSize,
          transportMode: transportMode || "file",
          finalStatus,
        },
      });
    } catch (dbErr: any) {
      // Persistence failure shouldn't fail the API response — we still return the XML
      console.error("NHIA claim persistence failed:", dbErr);
    }
  }

  return NextResponse.json({
    item: exportRecord,
    ico,
    validation,
    xml,
    warnings,
    exportResult,
  }, { status: exportRecord ? 201 : 200 });
}
