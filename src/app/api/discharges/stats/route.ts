// =====================================================================
// API: /api/discharges/stats
//   GET — discharge dashboard statistics
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
  if (facilityId) where.facilityId = facilityId;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(); monthStart.setMonth(monthStart.getMonth() - 1);

  // Resilient query helper — returns 0 on error instead of failing the entire endpoint
  const safeCount = async (w: any) => {
    try { return await db.dischargeRecord.count({ where: w }); } catch { return 0; }
  };
  const safeGroupBy = async (field: "dischargeType" | "disposition", w: any) => {
    try { return await db.dischargeRecord.groupBy({ by: [field], where: w, _count: true }); } catch { return []; }
  };

  const [totalDischarges, todayDischarges, weekDischarges, monthDischarges, pending, approved, ready, cancelled, delayed, finalized, byTypeRaw, byDispositionRaw] = await Promise.all([
    safeCount({ ...where, status: { not: "cancelled" } }),
    safeCount({ ...where, dischargedAt: { gte: todayStart, lte: todayEnd }, isFinalized: true }),
    safeCount({ ...where, dischargedAt: { gte: weekStart }, isFinalized: true }),
    safeCount({ ...where, dischargedAt: { gte: monthStart }, isFinalized: true }),
    safeCount({ ...where, status: "requested" }),
    safeCount({ ...where, status: "approved" }),
    safeCount({ ...where, status: "ready" }),
    safeCount({ ...where, status: "cancelled" }),
    safeCount({ ...where, status: "delayed" }),
    safeCount({ ...where, isFinalized: true }),
    safeGroupBy("dischargeType", { ...where, isFinalized: true }),
    safeGroupBy("disposition", { ...where, isFinalized: true }),
  ]);

  // Length of stay analytics — use finalized discharges with admissionDate
  let losValues: number[] = [];
  try {
    const finalizedDischarges = await db.dischargeRecord.findMany({
      where: { ...where, isFinalized: true, admissionDate: { not: null }, dischargedAt: { not: null } },
      select: { admissionDate: true, dischargedAt: true, dischargeType: true },
      take: 500,
    });
    losValues = finalizedDischarges
      .map((d) => (new Date(d.dischargedAt).getTime() - new Date(d.admissionDate!).getTime()) / (1000 * 60 * 60 * 24))
      .filter((v) => v >= 0);
  } catch {}
  const avgLOS = losValues.length > 0 ? losValues.reduce((s, v) => s + v, 0) / losValues.length : 0;
  const minLOS = losValues.length > 0 ? Math.min(...losValues) : 0;
  const maxLOS = losValues.length > 0 ? Math.max(...losValues) : 0;

  // Delay reason analytics (resilient)
  let delayedDischarges: any[] = [];
  try {
    delayedDischarges = await db.dischargeRecord.findMany({
      where: { ...where, status: "delayed", delayReason: { not: null } },
      select: { delayReason: true, delayDepartment: true },
      take: 200,
    });
  } catch {}
  const delayReasons: Record<string, number> = {};
  for (const d of delayedDischarges) {
    const r = d.delayReason || "Unknown";
    delayReasons[r] = (delayReasons[r] || 0) + 1;
  }

  // Clearance status counts (resilient)
  const [pendingClinical, pendingNursing, pendingPharmacy, pendingFinancial] = await Promise.all([
    safeCount({ ...where, status: { in: ["approved", "pending_clearance", "ready"] }, clinicalCleared: false }),
    safeCount({ ...where, status: { in: ["approved", "pending_clearance", "ready"] }, nursingCleared: false }),
    safeCount({ ...where, status: { in: ["approved", "pending_clearance", "ready"] }, pharmacyCleared: false }),
    safeCount({ ...where, status: { in: ["approved", "pending_clearance", "ready"] }, financialCleared: false }),
  ]);

  return NextResponse.json({
    totalDischarges,
    todayDischarges,
    weekDischarges,
    monthDischarges,
    pending,
    approved,
    ready,
    cancelled,
    delayed,
    finalized,
    pendingClinical,
    pendingNursing,
    pendingPharmacy,
    pendingFinancial,
    byType: byTypeRaw.map((r) => ({ label: r.dischargeType || "routine", count: r._count })),
    byDisposition: byDispositionRaw.map((r) => ({ label: r.disposition || "home", count: r._count })),
    los: {
      average: Math.round(avgLOS * 10) / 10,
      min: Math.round(minLOS * 10) / 10,
      max: Math.round(maxLOS * 10) / 10,
      count: losValues.length,
    },
    delayReasons: Object.entries(delayReasons).map(([reason, count]) => ({ reason, count })),
  });
}
