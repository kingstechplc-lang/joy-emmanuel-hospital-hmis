// =====================================================================
// API: /api/triage/stats
//   GET — triage dashboard KPIs (today's triage, acuity breakdown, alerts)
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
  if (!hasPermission(session, PERMISSIONS.TRIAGE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const where: any = {
    recordedAt: { gte: todayStart, lte: todayEnd },
  };
  if (facilityId) {
    where.encounter = { facilityId };
  }

  const [total, immediate, urgent, standard, nonUrgent, reassessments, abnormalAlerts, escalations] = await Promise.all([
    db.triageRecord.count({ where }),
    db.triageRecord.count({ where: { ...where, triageCategory: "1_immediate" } }),
    db.triageRecord.count({ where: { ...where, triageCategory: "2_urgent" } }),
    db.triageRecord.count({ where: { ...where, triageCategory: "3_standard" } }),
    db.triageRecord.count({ where: { ...where, triageCategory: "4_non_urgent" } }),
    db.triageRecord.count({ where: { ...where, isReassessment: true } }),
    db.triageRecord.count({ where: { ...where, NOT: { abnormalVitalsAlert: null } } }),
    db.triageRecord.count({ where: { ...where, NOT: { escalationLevel: null } } }),
  ]);

  return NextResponse.json({
    kpis: {
      total,
      immediate,
      urgent,
      standard,
      nonUrgent,
      reassessments,
      abnormalAlerts,
      escalations,
    },
  });
}
