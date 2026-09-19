// =====================================================================
// API: /api/admin/ai/usage
//   GET — aggregated AI usage statistics for the admin dashboard
//   Permission: ai_config.manage OR analytics.view
// =====================================================================
// Returns:
//   - totals: total calls today, this week, this month, all-time
//   - successRate: % of calls that succeeded (today / week / month)
//   - avgLatencyMs: average latency (today / week / month)
//   - callsByTool: [{ tool, count, successCount, errorCount, avgLatencyMs }]
//   - callsByProvider: [{ providerCode, providerName, count, successRate }]
//   - callsByModel: [{ modelCode, displayName, count, successRate }]
//   - recentCalls: [last 25 AIUsageLog rows]
//   - last24hSeries: [{ hour, count, successCount }] — hourly buckets
//   - _warning (optional): present when the underlying query failed
//     (e.g. AIUsageLog table not yet applied to the DB). Frontend
//     should still render the empty state — the warning gives the
//     admin visibility into what's wrong without breaking the page.
//
// The frontend polls this endpoint every 10s for realtime updates.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Helper that builds the "empty stats" payload returned on error or
// when no usage has been logged yet. Keeps the response shape stable
// so the frontend never has to handle missing fields.
function emptyStats(_warning?: string) {
  const now = new Date();
  const hourBuckets: { hour: string; count: number; successCount: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(now.getHours() - i, 0, 0, 0);
    hourBuckets.push({ hour: d.toISOString(), count: 0, successCount: 0 });
  }
  return {
    totals: { today: 0, week: 0, month: 0, allTime: 0 },
    successRate: { today: 100, week: 100, month: 100 },
    avgLatencyMs: { today: 0, week: 0, month: 0 },
    callsByTool: [],
    callsByProvider: [],
    callsByModel: [],
    recentCalls: [],
    last24hSeries: hourBuckets,
    generatedAt: now.toISOString(),
    _warning,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !hasPermission(session, PERMISSIONS.AI_CONFIG_MANAGE) &&
    !hasPermission(session, PERMISSIONS.ANALYTICS_VIEW)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now);
  startOfMonth.setDate(now.getDate() - 30);

  // ── All DB queries wrapped in try/catch ──────────────────────
  // If the AIUsageLog table doesn't exist yet (Vercel's prisma db
  // push hasn't finished, or failed silently) the queries will
  // throw Prisma's P2021 "table does not exist" error. We catch
  // that and return empty stats with a warning instead of 500-ing
  // and breaking the dashboard.
  try {
    // ── Totals ────────────────────────────────────────────────────
    const [totalToday, totalWeek, totalMonth, totalAll] = await Promise.all([
      db.aIUsageLog.count({ where: { createdAt: { gte: startOfToday } } }),
      db.aIUsageLog.count({ where: { createdAt: { gte: startOfWeek } } }),
      db.aIUsageLog.count({ where: { createdAt: { gte: startOfMonth } } }),
      db.aIUsageLog.count(),
    ]);

    // ── Success rate + avg latency (today, week, month) ──────────
    const [aggToday, aggWeek, aggMonth] = await Promise.all([
      db.aIUsageLog.aggregate({
        _count: { _all: true },
        _sum: { latencyMs: true },
        where: { createdAt: { gte: startOfToday } },
      }),
      db.aIUsageLog.aggregate({
        _count: { _all: true },
        _sum: { latencyMs: true },
        where: { createdAt: { gte: startOfWeek } },
      }),
      db.aIUsageLog.aggregate({
        _count: { _all: true },
        _sum: { latencyMs: true },
        where: { createdAt: { gte: startOfMonth } },
      }),
    ]);

    const [successToday, successWeek, successMonth] = await Promise.all([
      db.aIUsageLog.count({ where: { createdAt: { gte: startOfToday }, success: true } }),
      db.aIUsageLog.count({ where: { createdAt: { gte: startOfWeek }, success: true } }),
      db.aIUsageLog.count({ where: { createdAt: { gte: startOfMonth }, success: true } }),
    ]);

    const successRate = {
      today: totalToday > 0 ? Math.round((successToday / totalToday) * 100) : 100,
      week: totalWeek > 0 ? Math.round((successWeek / totalWeek) * 100) : 100,
      month: totalMonth > 0 ? Math.round((successMonth / totalMonth) * 100) : 100,
    };

    const avgLatencyMs = {
      today: aggToday._count._all > 0 ? Math.round((aggToday._sum.latencyMs ?? 0) / aggToday._count._all) : 0,
      week: aggWeek._count._all > 0 ? Math.round((aggWeek._sum.latencyMs ?? 0) / aggWeek._count._all) : 0,
      month: aggMonth._count._all > 0 ? Math.round((aggMonth._sum.latencyMs ?? 0) / aggMonth._count._all) : 0,
    };

    // ── Calls by tool / provider / model (last 30 days) ──────────
    const recentRows = await db.aIUsageLog.findMany({
      where: { createdAt: { gte: startOfMonth } },
      select: {
        tool: true,
        providerCode: true,
        providerName: true,
        modelCode: true,
        displayName: true,
        success: true,
        latencyMs: true,
      },
    });

    const byTool = new Map<string, { count: number; success: number; latencySum: number }>();
    const byProvider = new Map<string, { providerName: string; count: number; success: number }>();
    const byModel = new Map<string, { displayName: string; count: number; success: number }>();

    for (const r of recentRows) {
      const toolKey = r.tool || "unknown";
      const t = byTool.get(toolKey) || { count: 0, success: 0, latencySum: 0 };
      t.count++;
      if (r.success) t.success++;
      if (r.latencyMs != null) t.latencySum += r.latencyMs;
      byTool.set(toolKey, t);

      const p = byProvider.get(r.providerCode) || {
        providerName: r.providerName,
        count: 0,
        success: 0,
      };
      p.count++;
      if (r.success) p.success++;
      byProvider.set(r.providerCode, p);

      const m = byModel.get(r.modelCode) || {
        displayName: r.displayName,
        count: 0,
        success: 0,
      };
      m.count++;
      if (r.success) m.success++;
      byModel.set(r.modelCode, m);
    }

    const callsByTool = Array.from(byTool.entries())
      .map(([tool, v]) => ({
        tool,
        count: v.count,
        successCount: v.success,
        errorCount: v.count - v.success,
        avgLatencyMs: v.count > 0 ? Math.round(v.latencySum / v.count) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const callsByProvider = Array.from(byProvider.entries())
      .map(([providerCode, v]) => ({
        providerCode,
        providerName: v.providerName,
        count: v.count,
        successCount: v.success,
        successRate: v.count > 0 ? Math.round((v.success / v.count) * 100) : 100,
      }))
      .sort((a, b) => b.count - a.count);

    const callsByModel = Array.from(byModel.entries())
      .map(([modelCode, v]) => ({
        modelCode,
        displayName: v.displayName,
        count: v.count,
        successCount: v.success,
        successRate: v.count > 0 ? Math.round((v.success / v.count) * 100) : 100,
      }))
      .sort((a, b) => b.count - a.count);

    // ── Recent calls (last 25) ────────────────────────────────────
    const recentCalls = await db.aIUsageLog.findMany({
      take: 25,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        providerCode: true,
        providerName: true,
        modelCode: true,
        displayName: true,
        source: true,
        tool: true,
        success: true,
        errorMessage: true,
        latencyMs: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        userId: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    // ── Last 24h hourly series ────────────────────────────────────
    const last24hStart = new Date(now);
    last24hStart.setHours(now.getHours() - 23, 0, 0, 0);

    const last24hRows = await db.aIUsageLog.findMany({
      where: { createdAt: { gte: last24hStart } },
      select: { createdAt: true, success: true },
    });

    // Bucket by hour
    const hourBuckets: { hour: string; count: number; successCount: number }[] = [];
    const bucketMap = new Map<string, { count: number; success: number }>();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(now.getHours() - i, 0, 0, 0);
      const hourKey = d.toISOString();
      bucketMap.set(hourKey, { count: 0, success: 0 });
    }
    for (const r of last24hRows) {
      const d = new Date(r.createdAt);
      d.setMinutes(0, 0, 0);
      const hourKey = d.toISOString();
      const b = bucketMap.get(hourKey);
      if (b) {
        b.count++;
        if (r.success) b.success++;
      }
    }
    for (const [hour, v] of bucketMap.entries()) {
      hourBuckets.push({ hour, count: v.count, successCount: v.success });
    }

    return NextResponse.json({
      totals: {
        today: totalToday,
        week: totalWeek,
        month: totalMonth,
        allTime: totalAll,
      },
      successRate,
      avgLatencyMs,
      callsByTool,
      callsByProvider,
      callsByModel,
      recentCalls,
      last24hSeries: hourBuckets,
      generatedAt: now.toISOString(),
    });
  } catch (e: any) {
    // ── Defensive fallback ─────────────────────────────────────────
    // Log the full error server-side so an admin debugging via Vercel
    // logs can see the real cause, but return 200 with empty stats so
    // the admin dashboard doesn't crash. The most common cause here is
    // the AIUsageLog table not existing yet (Prisma P2021) — happens
    // when Vercel's prisma db push hasn't finished or failed silently.
    console.error("[AI Usage Endpoint] Error fetching usage stats:", e);

    const isMissingTable =
      e?.code === "P2021" ||
      /relation ".*AIUsageLog.*" does not exist/i.test(e?.message || "") ||
      /table.*not exist/i.test(e?.message || "");

    const warning = isMissingTable
      ? "AIUsageLog table is not yet available on the database. Wait for the latest Vercel deploy to finish running prisma db push, then refresh this page."
      : `Backend error: ${e?.message || "Unknown error"}. Check Vercel function logs for details.`;

    return NextResponse.json(emptyStats(warning));
  }
}
