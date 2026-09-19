import { NextResponse } from "next/server";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";
import { detectAnomalies, type LabResultInput } from "@/lib/ai/anomaly-detector";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "lab.view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const results: LabResultInput[] = body?.results;
  if (!Array.isArray(results) || results.length === 0)
    return NextResponse.json({ error: "results array is required" }, { status: 400 });

  try {
    const result = await detectAnomalies(results, { userId: session.user.id, tool: "anomaly" });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "AI_LAB_ANOMALY",
      actionCategory: "CDSS",
      severity: "warning",
      source: "ai",
      newValues: { testCount: results.length, anomalyCount: result.anomalies?.length || 0 },
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "AI request failed" }, { status: 500 });
  }
}
