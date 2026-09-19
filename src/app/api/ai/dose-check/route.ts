import { NextResponse } from "next/server";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";
import { checkPediatricDose, type DoseCheckInput } from "@/lib/ai/dose-checker";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "clinical.view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body?.medicationName)
    return NextResponse.json({ error: "medicationName is required" }, { status: 400 });

  try {
    const result = await checkPediatricDose(body as DoseCheckInput, { userId: session.user.id, tool: "dose" });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "AI_DOSE_CHECK",
      actionCategory: "CDSS",
      severity: "warning",
      source: "ai",
      newValues: { input: body, isSafe: result.isSafe },
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "AI request failed" }, { status: 500 });
  }
}
