// =====================================================================
// API: /api/cdss/regression-test/history
//   GET    — list past regression test runs (last 30), summary only.
//            Used by the CDSS Health Center to render a pass-rate
//            trend chart and a past-runs table.
//
// PERMISSIONS:
//   GET     requires  cdss.view  (or super_admin)
//
// Returns:
//   {
//     items: [{
//       id, startedAt, durationMs, totalTests, passCount, failCount,
//       warnCount, allPass, source, userId, userName, facilityId
//     }],
//     count: number,
//     trend: {
//       passRate: number,  // 0-100, last 30 runs
//       avgDurationMs: number,
//       failRate: number,
//       totalRuns: number
//     }
//   }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CDSS_VIEW)) {
    return NextResponse.json({ error: "Forbidden — requires cdss.view" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "30"), 100);
  const organizationId = session.user.organizationId;
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;

  try {
    const where: any = { organizationId };
    if (facilityId) where.facilityId = facilityId;

    const items = await db.regressionTestRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Compute trend stats
    const total = items.length;
    const passRuns = items.filter((r) => r.allPass).length;
    const failRuns = items.filter((r) => r.failCount > 0).length;
    const avgDurationMs = total > 0
      ? Math.round(items.reduce((sum, r) => sum + r.durationMs, 0) / total)
      : 0;
    const passRate = total > 0 ? Math.round((passRuns / total) * 100) : 0;
    const failRate = total > 0 ? Math.round((failRuns / total) * 100) : 0;

    return NextResponse.json({
      items: items.map((r) => ({
        id: r.id,
        startedAt: r.startedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        durationMs: r.durationMs,
        totalTests: r.totalTests,
        passCount: r.passCount,
        failCount: r.failCount,
        warnCount: r.warnCount,
        allPass: r.allPass,
        source: r.source,
        userId: r.userId,
        userName: r.user
          ? `${r.user.firstName} ${r.user.lastName}`.trim()
          : "Unknown",
        facilityId: r.facilityId,
      })),
      count: items.length,
      trend: {
        passRate,
        failRate,
        avgDurationMs,
        totalRuns: total,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/cdss/regression-test/history]", e);
    return NextResponse.json(
      { error: e.message || "Failed to load regression test history" },
      { status: 500 },
    );
  }
}
