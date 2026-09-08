// =====================================================================
// /api/cdss/check — Medication safety check (allergy + drug-drug)
// =====================================================================
// Called by the prescription UI for real-time safety feedback.
// Returns alerts without persisting them (persistence happens on
// prescription submit via the existing prescription API).
// =====================================================================
import { NextResponse } from "next/server";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { checkDrugAllergy, checkDrugDrugInteractions } from "@/lib/cdss/engine";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW) && !hasPermission(session, PERMISSIONS.PHARMACY_PRESCRIBE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { patientId, medicationName, medicationGenericName, medicationId, therapeuticClass } = body;
  if (!patientId || !medicationName) {
    return NextResponse.json({ error: "patientId and medicationName required" }, { status: 400 });
  }

  try {
    // A. Drug-allergy check
    const allergyAlerts = await checkDrugAllergy(patientId, medicationName, medicationGenericName);

    // B. Drug-drug interaction check (only if medicationId provided)
    let ddiAlerts: any[] = [];
    if (medicationId) {
      ddiAlerts = await checkDrugDrugInteractions(
        patientId,
        medicationId,
        medicationGenericName,
        therapeuticClass,
        session.user.organizationId,
      );
    }

    const allAlerts = [...allergyAlerts, ...ddiAlerts];

    // Per spec §21: distinguish "no alert found" from "check failed"
    return NextResponse.json({
      alerts: allAlerts,
      checkCompleted: true,
      checkError: null,
      summary: allAlerts.length === 0
        ? "Safety check completed. No significant interaction detected."
        : `${allAlerts.length} safety alert(s) detected.`,
    });
  } catch (e: any) {
    // Per spec §21: CDSS check failed ≠ no alert found
    return NextResponse.json({
      alerts: [],
      checkCompleted: false,
      checkError: e.message || "Safety check could not be completed.",
      summary: "Safety check could not be completed. Interaction service unavailable.",
    }, { status: 500 });
  }
}
