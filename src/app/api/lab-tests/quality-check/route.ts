// =====================================================================
// API: /api/lab-tests/quality-check
//   GET — runs catalog quality check; returns warnings + summary
// =====================================================================
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canViewCatalog, qualityCheck } from "@/lib/lab-catalog";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewCatalog(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const report = await qualityCheck(session.user.organizationId);
  return NextResponse.json(report);
}
