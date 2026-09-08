// =====================================================================
// API: /api/discharge-summaries/assemble
//   POST   — preview-assemble the structured content for an encounter
//            WITHOUT persisting anything. Used by the editor's
//            "Generate from encounter" / "Refresh from encounter" button
//            so the clinician can see what the assembled content would
//            look like before deciding to save.
//
// PERMISSIONS:  discharge_summary.create
// =====================================================================
import { NextResponse } from "next/server";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { assembleDischargeSummaryContent } from "@/lib/discharge-summary/assembler";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DISCHARGE_SUMMARY_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { encounterId } = body;
  if (!encounterId) {
    return NextResponse.json({ error: "encounterId is required" }, { status: 400 });
  }

  try {
    const assembled = await assembleDischargeSummaryContent(encounterId);
    return NextResponse.json({
      content: assembled.content,
      primaryDiagnosisName: assembled.primaryDiagnosisName,
      primaryDiagnosisCode: assembled.primaryDiagnosisCode,
      attendingClinicianId: assembled.attendingClinicianId,
      patientId: assembled.patientId,
      facilityId: assembled.facilityId,
      organizationId: assembled.organizationId,
      admissionId: assembled.admissionId,
      dischargeRecordId: assembled.dischargeRecordId,
    });
  } catch (e: any) {
    console.error("[POST /api/discharge-summaries/assemble]", e);
    return NextResponse.json({ error: e.message || "Failed to assemble content" }, { status: 500 });
  }
}
