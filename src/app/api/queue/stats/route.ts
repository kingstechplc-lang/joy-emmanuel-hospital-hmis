// =====================================================================
// API: /api/queue/stats
//   GET — queue dashboard KPIs (waiting, in progress, completed, avg wait time)
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
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId;
  if (!facilityId) return NextResponse.json({ kpis: {}, queues: [] });

  const dateStr = url.searchParams.get("date") || new Date().toISOString().split("T")[0];
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59`);

  // Get today's queues
  const queues = await db.queue.findMany({
    where: { facilityId, queueDate: { gte: dayStart, lte: dayEnd } },
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { entries: true } },
    },
  });

  // Get all entries for today
  const queueIds = queues.map((q) => q.id);
  const entries = queueIds.length > 0 ? await db.queueEntry.findMany({
    where: { queueId: { in: queueIds } },
    select: {
      id: true, queueId: true, status: true, priority: true,
      createdAt: true, calledAt: true, startedAt: true, completedAt: true,
    },
  }) : [];

  const waiting = entries.filter((e) => e.status === "waiting").length;
  const called = entries.filter((e) => e.status === "called").length;
  const inProgress = entries.filter((e) => e.status === "in_progress").length;
  const onHold = entries.filter((e) => e.status === "on_hold").length;
  const completed = entries.filter((e) => e.status === "completed").length;
  const skipped = entries.filter((e) => e.status === "skipped").length;
  const cancelled = entries.filter((e) => e.status === "cancelled").length;

  // Calculate average wait time (from createdAt to calledAt for completed entries)
  const completedWithTimes = entries.filter((e) => e.status === "completed" && e.calledAt);
  let avgWaitMin = 0;
  if (completedWithTimes.length > 0) {
    const totalWaitMs = completedWithTimes.reduce((sum, e) => {
      return sum + (new Date(e.calledAt!).getTime() - new Date(e.createdAt).getTime());
    }, 0);
    avgWaitMin = Math.round(totalWaitMs / completedWithTimes.length / 60000);
  }

  // Calculate average service time (from startedAt to completedAt)
  const completedWithService = entries.filter((e) => e.status === "completed" && e.startedAt && e.completedAt);
  let avgServiceMin = 0;
  if (completedWithService.length > 0) {
    const totalServiceMs = completedWithService.reduce((sum, e) => {
      return sum + (new Date(e.completedAt!).getTime() - new Date(e.startedAt!).getTime());
    }, 0);
    avgServiceMin = Math.round(totalServiceMs / completedWithService.length / 60000);
  }

  // Queue breakdown
  const queueBreakdown = queues.map((q) => {
    const qEntries = entries.filter((e) => e.queueId === q.id); // Note: entries don't have queueId directly in select, but we can count from queue._count
    return {
      id: q.id,
      queueType: q.queueType,
      departmentName: q.department?.name || "General",
      total: q._count.entries,
      waiting: qEntries.filter((e) => e.status === "waiting").length,
      inProgress: qEntries.filter((e) => e.status === "in_progress").length,
      completed: qEntries.filter((e) => e.status === "completed").length,
    };
  });

  return NextResponse.json({
    kpis: {
      total: entries.length,
      waiting,
      called,
      inProgress,
      onHold,
      completed,
      skipped,
      cancelled,
      avgWaitMin,
      avgServiceMin,
    },
    queues: queueBreakdown,
  });
}
