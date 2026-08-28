// =====================================================================
// API: /api/transfers/stats
//   GET — transfer dashboard statistics
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
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;

  const where: any = {};
  if (facilityId) {
    where.OR = [{ fromFacilityId: facilityId }, { toFacilityId: facilityId }];
  }

  const safeCount = async (w: any) => {
    try { return await db.patientTransfer.count({ where: w }); } catch { return 0; }
  };
  const safeGroupBy = async (field: any, w: any) => {
    try { return await db.patientTransfer.groupBy({ by: [field], where: w, _count: true }); } catch { return []; }
  };

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(); monthStart.setMonth(monthStart.getMonth() - 1);

  const [totalTransfers, todayTransfers, weekTransfers, monthTransfers, pending, approved, accepted, inTransit, completed, cancelled, delayed, rejected, internal, external] = await Promise.all([
    safeCount({ ...where, status: { not: "cancelled" } }),
    safeCount({ ...where, requestedAt: { gte: todayStart, lte: todayEnd } }),
    safeCount({ ...where, requestedAt: { gte: weekStart } }),
    safeCount({ ...where, requestedAt: { gte: monthStart } }),
    safeCount({ ...where, status: "requested" }),
    safeCount({ ...where, status: "approved" }),
    safeCount({ ...where, status: "accepted" }),
    safeCount({ ...where, status: "in_transit" }),
    safeCount({ ...where, status: "completed" }),
    safeCount({ ...where, status: "cancelled" }),
    safeCount({ ...where, status: "delayed" }),
    safeCount({ ...where, status: "rejected" }),
    safeCount({ ...where, transferType: "internal" }),
    safeCount({ ...where, transferType: "external" }),
  ]);

  // Priority breakdown
  const byPriorityRaw = await safeGroupBy("priority", where);
  // Type breakdown
  const byTypeRaw = await safeGroupBy("transferType", where);
  // Status breakdown
  const byStatusRaw = await safeGroupBy("status", where);

  // Performance: average transfer duration (requested → completed)
  let avgDurationHours: number | null = null;
  try {
    const completedTransfers = await db.patientTransfer.findMany({
      where: { ...where, status: "completed", completedAt: { not: null } },
      select: { requestedAt: true, completedAt: true },
      take: 100,
    });
    if (completedTransfers.length > 0) {
      const durations = completedTransfers.map((t) => (new Date(t.completedAt!).getTime() - new Date(t.requestedAt).getTime()) / (1000 * 60 * 60));
      avgDurationHours = Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10;
    }
  } catch {}

  // Delay reasons
  const delayedTransfers = await db.patientTransfer.findMany({
    where: { ...where, status: "delayed", delayReason: { not: null } },
    select: { delayReason: true },
    take: 100,
  }).catch(() => []);
  const delayReasons: Record<string, number> = {};
  for (const t of delayedTransfers) {
    const r = t.delayReason || "Unknown";
    delayReasons[r] = (delayReasons[r] || 0) + 1;
  }

  return NextResponse.json({
    totalTransfers,
    todayTransfers,
    weekTransfers,
    monthTransfers,
    pending,
    approved,
    accepted,
    inTransit,
    completed,
    cancelled,
    delayed,
    rejected,
    internal,
    external,
    byPriority: byPriorityRaw.map((r: any) => ({ label: r.priority, count: r._count })),
    byType: byTypeRaw.map((r: any) => ({ label: r.transferType, count: r._count })),
    byStatus: byStatusRaw.map((r: any) => ({ label: r.status, count: r._count })),
    avgDurationHours,
    delayReasons: Object.entries(delayReasons).map(([reason, count]) => ({ reason, count })),
  });
}
