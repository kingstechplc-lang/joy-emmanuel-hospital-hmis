import { NextResponse } from "next/server";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  interpretRadiologyReport,
  type RadiologyInterpretInput,
} from "@/lib/ai/radiology-interpreter";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "clinical.view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as RadiologyInterpretInput;
  if (!body?.reportText || typeof body.reportText !== "string")
    return NextResponse.json({ error: "reportText is required" }, { status: 400 });

  try {
    const result = await interpretRadiologyReport(body, { userId: session.user.id, tool: "radiology" });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "AI_RADIOLOGY_INTERPRET",
      actionCategory: "CDSS",
      severity: "info",
      source: "ai",
      newValues: {
        modality: body.modality || "unknown",
        bodyPart: body.bodyPart || "unknown",
        findingCount: result.findings?.length || 0,
        criticalFindingCount: result.criticalFindings?.length || 0,
        followUpRecommended: result.followUpRecommended,
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
