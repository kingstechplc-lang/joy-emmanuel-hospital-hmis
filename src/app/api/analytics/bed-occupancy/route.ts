// =====================================================================
// API: /api/analytics/bed-occupancy
//   GET — Bed occupancy analytics.
//
// Auth: NextAuth staff session, requires PERMISSIONS.REPORT_VIEW.
// Facility-scoped: when session.user.facilityId is set and the user is
//   not a super_admin, beds + admissions are limited to that facility.
//
// Query params:
//   ?period=30d|90d|1y|all   (default: 90d)
//   (Only the 30-day window is used for the daily admission/discharge
//    trend, per the task spec. The `period` param still controls auth-
//    surface uniformity with the other analytics endpoints.)
//
// Returns:
//   {
//     period: "90d",
//     generatedAt: "2026-…Z",
//     totalBeds: number,
//     occupiedBeds: number,
//     availableBeds: number,
//     occupancyRate: number,       // 0-100
//     dailyTrend: [{ date, admissions, discharges }]   // last 30 days
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
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function ymdKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

    // -----------------------------------------------------------------
    // 1. Current bed snapshot.
    //    Only `lifecycleStatus = "active"` beds are counted (matches
    //    the /api/beds/stats semantics — retired/inactive beds shouldn't
    //    be in the denominator).
    // -----------------------------------------------------------------
    const bedWhere: any = { lifecycleStatus: "active" };
    if (!isSuperAdmin && facilityId) {
      bedWhere.facilityId = facilityId;
    }
    const beds = await db.bed.findMany({
      where: bedWhere,
      select: { id: true, status: true },
    });

    const totalBeds = beds.length;
    let occupiedBeds = 0;
    let availableBeds = 0;
    for (const b of beds) {
      if (b.status === "occupied") occupiedBeds += 1;
      else if (b.status === "available") availableBeds += 1;
    }
    const occupancyRate =
      totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 1000) / 10 : 0;

    // -----------------------------------------------------------------
    // 2. Daily admissions + discharges for the last 30 days.
    //    We fetch both lists and bucket by YYYY-MM-DD on admittedAt /
    //    dischargedAt respectively, then merge into a single sorted
    //    timeline. The 30-day window is fixed per the task spec
    //    (regardless of ?period=).
    // -----------------------------------------------------------------
    const trendStart = new Date(Date.now() - 30 * DAY_MS);

    const admissionWhere: any = {
      admittedAt: { gte: trendStart },
    };
    const dischargeWhere: any = {
      dischargedAt: { gte: trendStart },
    };
    if (!isSuperAdmin && facilityId) {
      admissionWhere.facilityId = facilityId;
      dischargeWhere.facilityId = facilityId;
    }

    const [admissionRows, dischargeRows] = await Promise.all([
      db.admission.findMany({
        where: admissionWhere,
        select: { admittedAt: true },
      }),
      db.admission.findMany({
        where: dischargeWhere,
        select: { dischargedAt: true },
      }),
    ]);

    const dayMap = new Map<string, { admissions: number; discharges: number }>();
    const bump = (key: string, field: "admissions" | "discharges") => {
      const e = dayMap.get(key) ?? { admissions: 0, discharges: 0 };
      e[field] += 1;
      dayMap.set(key, e);
    };
    for (const a of admissionRows) {
      if (!a.admittedAt) continue;
      bump(ymdKey(new Date(a.admittedAt)), "admissions");
    }
    for (const d of dischargeRows) {
      if (!d.dischargedAt) continue;
      bump(ymdKey(new Date(d.dischargedAt)), "discharges");
    }
    const dailyTrend = [...dayMap.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    return NextResponse.json({
      period,
      periodStart: periodStart ? periodStart.toISOString() : null,
      generatedAt: new Date().toISOString(),
      totalBeds,
      occupiedBeds,
      availableBeds,
      occupancyRate,
      dailyTrend,
    });
  } catch (e: any) {
    console.error("[GET /api/analytics/bed-occupancy]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to compute bed occupancy analytics" },
      { status: 500 }
    );
  }
}
