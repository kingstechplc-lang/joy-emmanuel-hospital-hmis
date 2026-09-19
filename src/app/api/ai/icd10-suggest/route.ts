import { NextResponse } from "next/server";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";
import { suggestICD10 } from "@/lib/ai/icd10-suggester";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "clinical.view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const freeText = body?.freeText;
  if (!freeText) return NextResponse.json({ error: "freeText is required" }, { status: 400 });

  try {
    const result = await suggestICD10(freeText, { userId: session.user.id, tool: "icd10" });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "AI_ICD10_SUGGEST",
      actionCategory: "CDSS",
      severity: "info",
      source: "ai",
      newValues: { input: freeText, suggestionCount: result.suggestions?.length || 0 },
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "AI request failed" }, { status: 500 });
  }
}
