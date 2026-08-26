// =====================================================================
// API: /api/ward-rounds/stats
//   GET — ward rounds dashboard stats
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.WARD_ROUND_VIEW) && !session.user.permissions?.includes(PERMISSIONS.ADMISSION_VIEW) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const where: any = {};
  if (facilityId) where.facilityId = facilityId;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [totalRounds, todayRounds, scheduledRounds, activeRounds, completedToday, cancelledToday, totalPatients, reviewedToday, pendingActions, completedActionsToday, overdueActions] = await Promise.all([
    db.wardRound.count({ where }),
    db.wardRound.count({ where: { ...where, roundDate: { gte: todayStart, lte: todayEnd } } }),
    db.wardRound.count({ where: { ...where, status: "scheduled" } }),
    db.wardRound.count({ where: { ...where, status: "in_progress" } }),
    db.wardRound.count({ where: { ...where, status: "completed", completedAt: { gte: todayStart, lte: todayEnd } } }),
    db.wardRound.count({ where: { ...where, status: "cancelled", cancelledAt: { gte: todayStart, lte: todayEnd } } }),
    db.wardRoundPatient.count({ where: { wardRound: { facilityId: facilityId || undefined } } }),
    db.wardRoundPatient.count({ where: { wardRound: { facilityId: facilityId || undefined }, reviewStatus: "reviewed", reviewedAt: { gte: todayStart, lte: todayEnd } } }),
    db.wardRoundAction.count({ where: { ...where, status: { in: ["pending", "in_progress"] } } }),
    db.wardRoundAction.count({ where: { ...where, status: "completed", completedAt: { gte: todayStart, lte: todayEnd } } }),
    db.wardRoundAction.count({ where: { ...where, status: "pending", dueDate: { lt: new Date() } } }),
  ]);

  const byTypeRaw = await db.wardRound.groupBy({ by: ["roundType"], where, _count: true });
  const byType = byTypeRaw.map((r) => ({ label: r.roundType, count: r._count }));

  return NextResponse.json({
    totalRounds, todayRounds, scheduledRounds, activeRounds, completedToday, cancelledToday,
    totalPatients, reviewedToday, pendingActions, completedActionsToday, overdueActions, byType,
  });
}
