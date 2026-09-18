import { NextResponse } from "next/server";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  checkPrescriptions,
  type PrescriptionCheckInput,
} from "@/lib/ai/prescription-checker";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "clinical.view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as PrescriptionCheckInput;
  if (!Array.isArray(body?.prescriptions) || body.prescriptions.length === 0)
    return NextResponse.json(
      { error: "prescriptions array is required" },
      { status: 400 }
    );

  try {
    const result = await checkPrescriptions(body);
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "AI_PRESCRIPTION_CHECK",
      actionCategory: "CDSS",
      severity: "info",
      source: "ai",
      newValues: {
        prescriptionCount: body.prescriptions.length,
        errorCount: result.errors?.length || 0,
        safeCount: result.safePrescriptions?.length || 0,
        overallSafety: result.overallSafety,
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
