import { NextResponse } from "next/server";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  stratifyPatientRisk,
  type RiskStratificationInput,
} from "@/lib/ai/risk-stratification";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "clinical.view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as RiskStratificationInput;
  if (!Array.isArray(body?.comorbidities) || !Array.isArray(body?.currentMedications))
    return NextResponse.json(
      { error: "comorbidities and currentMedications arrays are required" },
      { status: 400 }
    );

  try {
    const result = await stratifyPatientRisk(body);
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "AI_RISK_STRATIFICATION",
      actionCategory: "CDSS",
      severity: "info",
      source: "ai",
      newValues: {
        comorbidityCount: body.comorbidities.length,
        medicationCount: body.currentMedications.length,
        scoreCount: result.riskScores?.length || 0,
        overallRisk: result.overallRisk,
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
