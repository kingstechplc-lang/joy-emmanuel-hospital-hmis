// =====================================================================
// API: /api/analytics/staff-productivity
//   GET — Staff productivity metrics from the Consultation model.
//
// Auth: NextAuth staff session, requires PERMISSIONS.REPORT_VIEW.
// Facility-scoped: when session.user.facilityId is set and the user is
//   not a super_admin, consultations are limited to those whose
//   encounter belongs to that facility. Consultation itself has no
//   facilityId column; scope is applied via `encounter.facilityId`.
//
// Query params:
//   ?period=30d|90d|1y|all   (default: 90d)
//
// Returns:
//   {
//     period: "90d",
//     periodStart: "2026-…Z" | null,
//     daysInPeriod: number,
//     byClinician: [
//       { clinicianId, name, consultationCount, avgPerDay }
//     ],
//     dailyTrend: [{ date, count }]   // per-day breakdown across the
//                                    // top 5 clinicians (by total count)
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

function daysBetween(start: Date | null, end: Date): number {
  if (!start) return 0;
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function ymdKey(d: Date): string {
  // YYYY-MM-DD (UTC for stable bucketing across DST)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function displayName(u: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  username?: string | null;
} | null): string {
  if (!u) return "Unknown";
  const parts = [u.firstName, u.middleName, u.lastName].filter(
    (p): p is string => Boolean(p && p.length > 0)
  );
  if (parts.length > 0) return parts.join(" ");
  return u.username ?? "Unknown";
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
    const now = new Date();
    const daysInPeriod = periodStart ? daysBetween(periodStart, now) : 0;
    const isSuperAdmin = session.user.roles.includes("super_admin");
    const facilityId = session.user.facilityId;

    // Build Consultation `where` — scope via encounter.facilityId and
    // period filter on createdAt.
    const where: any = {};
    if (periodStart) {
      where.createdAt = { gte: periodStart };
    }
    if (!isSuperAdmin && facilityId) {
      where.encounter = { facilityId };
    }

    // -----------------------------------------------------------------
    // 1. Per-clinician consultation counts.
    //    Consultations with null clinicianId (e.g., drafts without an
    //    assigned clinician) are grouped under clinicianId = null and
    //    surfaced separately.
    // -----------------------------------------------------------------
    const byClinicianGroups = await db.consultation.groupBy({
      by: ["clinicianId"],
      where,
      _count: { _all: true },
      orderBy: { _count: { clinicianId: "desc" } },
    });

    const clinicianIds = byClinicianGroups
      .map((g) => g.clinicianId)
      .filter((id): id is string => Boolean(id));

    const users =
      clinicianIds.length > 0
        ? await db.user.findMany({
            where: { id: { in: clinicianIds } },
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              username: true,
            },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const byClinician = byClinicianGroups.map((g) => {
      const id = g.clinicianId;
      const u = id ? userMap.get(id) ?? null : null;
      const count = g._count._all;
      const avgPerDay =
        daysInPeriod > 0
          ? Math.round((count / daysInPeriod) * 1000) / 1000
          : null;
      return {
        clinicianId: id ?? null,
        name: id ? displayName(u) : "(Unassigned)",
        consultationCount: count,
        avgPerDay,
      };
    });

    // -----------------------------------------------------------------
    // 2. Per-day breakdown for the top 5 clinicians (by consultation
    //    count). Fetch consultations for just those clinician IDs and
    //    bucket by YYYY-MM-DD.
    // -----------------------------------------------------------------
    const top5Ids = byClinician
      .filter((r) => r.clinicianId !== null)
      .slice(0, 5)
      .map((r) => r.clinicianId as string);

    let dailyTrend: { date: string; count: number }[] = [];
    if (top5Ids.length > 0) {
      const topWhere: any = {
        ...where,
        clinicianId: { in: top5Ids },
      };
      const rows = await db.consultation.findMany({
        where: topWhere,
        select: { createdAt: true },
      });
      const dayMap = new Map<string, number>();
      for (const r of rows) {
        if (!r.createdAt) continue;
        const key = ymdKey(new Date(r.createdAt));
        dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
      }
      dailyTrend = [...dayMap.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
    }

    return NextResponse.json({
      period,
      periodStart: periodStart ? periodStart.toISOString() : null,
      generatedAt: new Date().toISOString(),
      daysInPeriod,
      byClinician,
      dailyTrend,
    });
  } catch (e: any) {
    console.error("[GET /api/analytics/staff-productivity]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to compute staff productivity analytics" },
      { status: 500 }
    );
  }
}
