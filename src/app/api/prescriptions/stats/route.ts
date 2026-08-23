// =====================================================================
// API: /api/prescriptions/stats
//   GET — prescription dashboard KPIs
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
  if (!hasPermission(session, PERMISSIONS.PHARMACY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const where: any = {
    prescribedAt: { gte: todayStart, lte: todayEnd },
  };
  if (facilityId) where.facilityId = facilityId;

  const [total, pending, approved, partiallyDispensed, dispensed, cancelled, discontinued, allergyAlerts] = await Promise.all([
    db.prescription.count({ where }),
    db.prescription.count({ where: { ...where, status: "pending" } }),
    db.prescription.count({ where: { ...where, status: "approved" } }),
    db.prescription.count({ where: { ...where, status: "partially_dispensed" } }),
    db.prescription.count({ where: { ...where, status: "dispensed" } }),
    db.prescription.count({ where: { ...where, status: "cancelled" } }),
    db.prescription.count({ where: { ...where, status: "discontinued" } }),
    db.prescription.count({ where: { ...where, NOT: { allergyWarnings: null } } }),
  ]);

  return NextResponse.json({
    kpis: {
      total, pending, approved, partiallyDispensed, dispensed,
      cancelled, discontinued, allergyAlerts,
    },
  });
}
