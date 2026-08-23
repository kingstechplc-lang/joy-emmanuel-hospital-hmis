// =====================================================================
// API: /api/referrals/stats
//   GET — referral dashboard KPIs for the active facility.
//   Returns counts by status, urgency, type, feedback status, plus
//   overdue referrals and 7/30-day trend.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { getOverdueStatus } from "@/lib/referral-lifecycle";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId;
  if (!facilityId) {
    return NextResponse.json({
      kpis: {
        total: 0, pending: 0, urgent: 0, emergency: 0,
        accepted: 0, rejected: 0, completed: 0, cancelled: 0,
        awaitingFeedback: 0, followUpRequired: 0, overdue: 0,
      },
      byStatus: {},
      byUrgency: {},
      byType: {},
      byFeedbackStatus: {},
      trend: { last7days: [], last30days: [] },
    });
  }

  const where = {
    OR: [
      { referringFacilityId: facilityId },
      { receivingFacilityId: facilityId },
    ],
  };

  // Total + status breakdown
  const [total, statusGroups, urgencyGroups, typeGroups, feedbackGroups] = await Promise.all([
    db.referral.count({ where }),
    db.referral.groupBy({ by: ["status"], where, _count: true }),
    db.referral.groupBy({ by: ["urgency"], where, _count: true }),
    db.referral.groupBy({ by: ["referralType"], where, _count: true }),
    db.referral.groupBy({ by: ["feedbackStatus"], where, _count: true }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const g of statusGroups) byStatus[g.status] = g._count;
  const byUrgency: Record<string, number> = {};
  for (const g of urgencyGroups) byUrgency[g.urgency] = g._count;
  const byType: Record<string, number> = {};
  for (const g of typeGroups) byType[g.referralType] = g._count;
  const byFeedbackStatus: Record<string, number> = {};
  for (const g of feedbackGroups) byFeedbackStatus[g.feedbackStatus] = g._count;

  // Trend — referrals created per day for the last 7 and 30 days
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const last7Start = new Date(now.getTime() - 7 * dayMs);
  const last30Start = new Date(now.getTime() - 30 * dayMs);

  const [recent7, recent30] = await Promise.all([
    db.referral.findMany({
      where: { ...where, referredAt: { gte: last7Start } },
      select: { referredAt: true, status: true, urgency: true },
    }),
    db.referral.findMany({
      where: { ...where, referredAt: { gte: last30Start } },
      select: { referredAt: true },
    }),
  ]);

  const buildDailyBuckets = (refs: { referredAt: Date }[], days: number) => {
    const buckets: { date: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * dayMs);
      const iso = d.toISOString().slice(0, 10);
      buckets.push({ date: iso, count: 0 });
    }
    const bucketMap = new Map(buckets.map((b) => [b.date, b]));
    for (const r of refs) {
      const iso = new Date(r.referredAt).toISOString().slice(0, 10);
      const b = bucketMap.get(iso);
      if (b) b.count++;
    }
    return buckets;
  };

  // Overdue detection — fetch referrals in overdue-prone statuses and
  // apply getOverdueStatus() to each
  const overdueCandidates = await db.referral.findMany({
    where: {
      ...where,
      status: { in: ["sent", "accepted", "completed"] },
    },
    select: {
      id: true,
      status: true,
      sentAt: true,
      acknowledgedAt: true,
      acceptedAt: true,
      completedAt: true,
      feedbackStatus: true,
    },
  });
  const overdueItems = overdueCandidates
    .map((r) => ({ id: r.id, ...getOverdueStatus(r) }))
    .filter((r) => r.isOverdue);

  const kpis = {
    total,
    pending: (byStatus["submitted"] || 0) + (byStatus["draft"] || 0) + (byStatus["pending"] || 0),
    urgent: byUrgency["urgent"] || 0,
    emergency: byUrgency["emergency"] || 0,
    accepted: byStatus["accepted"] || 0,
    rejected: byStatus["rejected"] || 0,
    completed: byStatus["completed"] || 0,
    cancelled: byStatus["cancelled"] || 0,
    inTransit: (byStatus["in_transit"] || 0) + (byStatus["arrived"] || 0) + (byStatus["under_care"] || 0),
    awaitingFeedback:
      (byStatus["completed"] || 0) + (byStatus["feedback_received"] || 0) > 0
        ? byFeedbackStatus["awaiting"] || 0
        : 0,
    followUpRequired: (byStatus["follow_up"] || 0) + (byFeedbackStatus["follow_up_required"] || 0),
    overdue: overdueItems.length,
  };

  return NextResponse.json({
    kpis,
    byStatus,
    byUrgency,
    byType,
    byFeedbackStatus,
    trend: {
      last7days: buildDailyBuckets(recent7, 7),
      last30days: buildDailyBuckets(recent30, 30),
    },
    overdueItems: overdueItems.slice(0, 20), // cap payload size
  });
}
