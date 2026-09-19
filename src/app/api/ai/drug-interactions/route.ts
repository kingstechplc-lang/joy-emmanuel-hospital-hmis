import { NextResponse } from "next/server";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  checkDrugInteractions,
  type DrugInteractionCheckerInput,
} from "@/lib/ai/drug-interaction-checker";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "clinical.view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as DrugInteractionCheckerInput;
  if (!Array.isArray(body?.medications) || body.medications.length === 0)
    return NextResponse.json({ error: "medications array is required" }, { status: 400 });

  try {
    const result = await checkDrugInteractions(body, { userId: session.user.id, tool: "drug_interactions" });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "AI_DRUG_INTERACTIONS",
      actionCategory: "CDSS",
      severity: "info",
      source: "ai",
      newValues: {
        medicationCount: body.medications.length,
        interactionCount: result.interactions?.length || 0,
        allergyWarningCount: result.allergyWarnings?.length || 0,
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
