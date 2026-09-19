import { NextResponse } from "next/server";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";
import { scoreTriage, type TriageInput } from "@/lib/ai/triage-scorer";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "clinical.view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body?.chiefComplaint)
    return NextResponse.json({ error: "chiefComplaint is required" }, { status: 400 });

  try {
    const result = await scoreTriage(body as TriageInput, { userId: session.user.id, tool: "triage" });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "AI_TRIAGE_SCORE",
      actionCategory: "CDSS",
      severity: "info",
      source: "ai",
      newValues: { input: body, category: result.category },
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "AI request failed" }, { status: 500 });
  }
}
