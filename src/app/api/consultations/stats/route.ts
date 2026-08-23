// =====================================================================
// API: /api/consultations/stats
//   GET — consultation dashboard KPIs
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
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const where: any = {
    createdAt: { gte: todayStart, lte: todayEnd },
  };
  if (facilityId) {
    where.encounter = { facilityId };
  }

  const [total, drafts, signed, amended, admissions, referrals, followUps, prescriptions] = await Promise.all([
    db.consultation.count({ where }),
    db.consultation.count({ where: { ...where, status: "draft" } }),
    db.consultation.count({ where: { ...where, status: "signed" } }),
    db.consultation.count({ where: { ...where, status: "amended" } }),
    db.consultation.count({ where: { ...where, disposition: "admission" } }),
    db.consultation.count({ where: { ...where, disposition: "referral" } }),
    db.consultation.count({ where: { ...where, disposition: "follow_up" } }),
    db.consultation.count({ where: { ...where, disposition: "pharmacy" } }),
  ]);

  // Calculate avg consultation duration for finalized today
  const signedToday = await db.consultation.findMany({
    where: { ...where, status: "signed", consultationStart: { not: null }, consultationEnd: { not: null } },
    select: { consultationStart: true, consultationEnd: true },
  });
  let avgDurationMin = 0;
  if (signedToday.length > 0) {
    const totalMs = signedToday.reduce((sum, c) => {
      return sum + (new Date(c.consultationEnd!).getTime() - new Date(c.consultationStart!).getTime());
    }, 0);
    avgDurationMin = Math.round(totalMs / signedToday.length / 60000);
  }

  return NextResponse.json({
    kpis: {
      total, drafts, signed, amended,
      admissions, referrals, followUps, prescriptions,
      avgDurationMin,
    },
  });
}
