// =====================================================================
// API: /api/claim-readiness/[encounterId]
//   GET — fetch the latest readiness assessment for an encounter
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ encounterId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLAIM_READINESS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { encounterId } = await params;

  const item = await db.claimReadinessAssessment.findFirst({
    where: {
      encounterId,
      organizationId: session.user.organizationId,
    },
    orderBy: { evaluatedAt: "desc" },
  });

  if (!item) {
    return NextResponse.json({
      item: null,
      message: "No readiness assessment yet — POST /api/claim-readiness to evaluate.",
    });
  }

  return NextResponse.json({ item });
}
