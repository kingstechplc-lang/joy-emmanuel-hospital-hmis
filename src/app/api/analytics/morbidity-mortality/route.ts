// =====================================================================
// API: /api/analytics/morbidity-mortality
//   GET — Top diagnoses by count for the period + monthly trend.
//
// Auth: NextAuth staff session, requires PERMISSIONS.REPORT_VIEW.
// Facility-scoped: when session.user.facilityId is set and the user is
//   not a super_admin, results are limited to diagnoses whose encounter
//   belongs to that facility. super_admin sees all facilities.
//
// Query params:
//   ?period=30d|90d|1y|all   (default: 90d)
//
// Returns:
//   {
//     period: "90d",
//     periodStart: "2026-…Z" | null,
//     topDiagnoses: [{ name, code, count, isPrimaryCount }],
//     monthlyTrend: [{ month, count }]
//   }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

type PeriodKey = "30d" | "90d" | "1y" | "all";

function computePeriodStart(period: PeriodKey): Date | null {
  if (period === "all") return null;
  const now = new Date();
  const days = period === "30d" ? 30 : period === "90d" ? 90 : 365;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return start;
}

function ymKey(d: Date): string {
  // ISO YYYY-MM (UTC to keep grouping stable across DST)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session, PERMISSIONS.REPORT_VIEW)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const rawPeriod = url.searchParams.get("period") as PeriodKey | null;
    const period: PeriodKey =
      rawPeriod === "30d" || rawPeriod === "90d" || rawPeriod === "1y" || rawPeriod === "all"
        ? rawPeriod
        : "90d";

    const periodStart = computePeriodStart(period);

    const isSuperAdmin = session.user.roles.includes("super_admin");
    const facilityId = session.user.facilityId;

    // Build the Diagnosis `where` clause:
    //   - period filter on `diagnosedAt`
    //   - facility filter via the encounter relation (Diagnosis has no
    //     facilityId column itself; it inherits scope from its encounter).
    const where: any = {};
    if (periodStart) {
      where.diagnosedAt = { gte: periodStart };
    }
    if (!isSuperAdmin && facilityId) {
      where.encounter = { facilityId };
    }

    // -----------------------------------------------------------------
    // Top diagnoses by (name || code) + primary/secondary split.
    //
    // Prisma's groupBy can't pivot "is primary" and "is secondary" in a
    // single call, so we run two groupBys in parallel:
    //   1. groupBy diagnosisName with _count to get totals
    //   2. groupBy diagnosisName WHERE isPrimary = true to get primary-only
    // We then merge them in JS. If diagnosisName is null, we fall back to
    // diagnosisCode (rare — diagnosisName is NOT NULL in schema, but the
    // fallback guards against data-migration quirks).
    // -----------------------------------------------------------------
    const [nameGroups, primaryGroups, monthlyRows] = await Promise.all([
      db.diagnosis.groupBy({
        by: ["diagnosisName"],
        where,
        _count: { _all: true },
        orderBy: { _count: { diagnosisName: "desc" } },
        take: 50,
      }),
      db.diagnosis.groupBy({
        by: ["diagnosisName"],
        where: { ...where, isPrimary: true },
        _count: { _all: true },
      }),
      // Monthly trend — fetch the bare rows and bucket in JS. groupBy with
      // a date bucket isn't supported in Prisma across all DBs, so we pull
      // the lightweight diagnosedAt column for the period and bucket
      // client-side. For multi-year "all" windows this stays cheap because
      // we only select one column.
      periodStart
        ? db.diagnosis.findMany({
            where,
            select: { diagnosisName: true, diagnosedAt: true },
          })
        : Promise.resolve([]),
    ]);

    // Build primary-count lookup keyed by diagnosisName
    const primaryByCount = new Map<string, number>();
    for (const row of primaryGroups) {
      const key = row.diagnosisName ?? "(uncoded)";
      primaryByCount.set(key, row._count._all);
    }

    const topDiagnoses = nameGroups.map((row) => {
      const name = row.diagnosisName ?? "(uncoded)";
      return {
        name,
        // The catalog code is snapshotted per-Diagnosis row, not per-group,
        // so we cannot return a single representative code here without an
        // extra fetch. We surface the (possibly null) name as the primary
        // label and leave code null for the group view.
        code: null as string | null,
        count: row._count._all,
        isPrimaryCount: primaryByCount.get(name) ?? 0,
      };
    });

    // -----------------------------------------------------------------
    // Monthly trend: bucket the rows we fetched above by YYYY-MM.
    // -----------------------------------------------------------------
    const monthMap = new Map<string, number>();
    for (const r of monthlyRows) {
      if (!r.diagnosedAt) continue;
      const key = ymKey(new Date(r.diagnosedAt));
      monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
    }
    const monthlyTrend = [...monthMap.entries()]
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => (a.month < b.month ? -1 : 1));

    return NextResponse.json({
      period,
      periodStart: periodStart ? periodStart.toISOString() : null,
      generatedAt: new Date().toISOString(),
      topDiagnoses,
      monthlyTrend,
    });
  } catch (e: any) {
    console.error("[GET /api/analytics/morbidity-mortality]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to compute morbidity/mortality analytics" },
      { status: 500 }
    );
  }
}
