import { NextResponse } from "next/server";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  generateDischargeSummary,
  type DischargeGenerateInput,
} from "@/lib/ai/discharge-generator";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "clinical.view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as DischargeGenerateInput;
  if (!Array.isArray(body?.diagnoses) || body.diagnoses.length === 0)
    return NextResponse.json({ error: "diagnoses array is required" }, { status: 400 });

  try {
    const result = await generateDischargeSummary(body, { userId: session.user.id, tool: "discharge_gen" });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "AI_DISCHARGE_GENERATE",
      actionCategory: "CDSS",
      severity: "info",
      source: "ai",
      newValues: {
        encounterId: body.encounterId || null,
        diagnosisCount: body.diagnoses.length,
        medicationCount: body.medications?.length || 0,
        labResultCount: body.labResults?.length || 0,
        dischargeMedicationCount: result.dischargeMedications?.length || 0,
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
