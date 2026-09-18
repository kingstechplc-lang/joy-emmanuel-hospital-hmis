import { NextResponse } from "next/server";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  generateClinicalSummary,
  type ClinicalSummaryInput,
} from "@/lib/ai/clinical-summary-generator";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "clinical.view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as ClinicalSummaryInput;
  if (!Array.isArray(body?.diagnoses) || body.diagnoses.length === 0)
    return NextResponse.json({ error: "diagnoses array is required" }, { status: 400 });

  try {
    const result = await generateClinicalSummary(body);
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "AI_CLINICAL_SUMMARY",
      actionCategory: "CDSS",
      severity: "info",
      source: "ai",
      newValues: {
        diagnosisCount: body.diagnoses.length,
        medicationCount: body.medications?.length || 0,
        labResultCount: body.labResults?.length || 0,
        problemCount: result.activeProblems?.length || 0,
      },
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "AI request failed" },
      { status: 500 }
    );
  }
}
