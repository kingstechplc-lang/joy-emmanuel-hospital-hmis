// =====================================================================
// API: /api/nhia-claims/stats
//   GET — dashboard KPIs for the NHIA Claims module.
//   Query: ?facilityId=...&period=2026-08
//   Returns: { kpis: { totalExports, validExports, failedExports,
//                      totalClaimAmount, totalDownloads,
//                      bridgeReachable, lastGenerationAt },
//              statusBreakdown: { draft, validated, xml_generated, exported, failed },
//              recentActivity: [...] }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { createTransport } from "@/integrations/nhia/claim-it";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.NHIA_CLAIM_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const period = url.searchParams.get("period");

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (period) where.submissionPeriod = period;

  const [totalExports, validExports, failedExports, totalDownloadsAgg, grossAgg, recentActivity, statusGroups] =
    await Promise.all([
      db.nhiaClaimExport.count({ where }),
      db.nhiaClaimExport.count({ where: { ...where, isValid: true } }),
      db.nhiaClaimExport.count({ where: { ...where, status: "failed" } }),
      db.nhiaClaimExport.aggregate({ where, _sum: { downloadCount: true } }),
      db.nhiaClaimExport.aggregate({ where: { ...where, isValid: true }, _sum: { grossAmount: true } }),
      db.nhiaClaimExport.findMany({
        where,
        orderBy: { generatedAt: "desc" },
        take: 5,
        select: {
          id: true, claimNumber: true, encounterId: true, patientName: true,
          status: true, isValid: true, errorCount: true, warningCount: true,
          grossAmount: true, generatedByName: true, generatedAt: true,
        },
      }),
      db.nhiaClaimExport.groupBy({
        by: ["status"],
        where,
        _count: true,
      }),
    ]);

  // Bridge health check (best-effort, with timeout)
  let bridgeReachable: boolean | null = null;
  try {
    const transport = createTransport("bridge");
    const health = await transport.healthCheck();
    bridgeReachable = health.reachable;
  } catch {
    bridgeReachable = false;
  }

  const statusBreakdown: Record<string, number> = {};
  for (const g of statusGroups) {
    statusBreakdown[g.status] = g._count;
  }

  return NextResponse.json({
    kpis: {
      totalExports,
      validExports,
      failedExports,
      totalDownloads: totalDownloadsAgg._sum.downloadCount || 0,
      totalClaimAmount: grossAgg._sum.grossAmount || 0,
      bridgeReachable,
      successRate: totalExports > 0 ? Math.round((validExports / totalExports) * 100) : 0,
    },
    statusBreakdown,
    recentActivity,
  });
}
