// =====================================================================
// API: /api/admissions/census
//   GET — inpatient census + dashboard stats with LOS calculation
//   Query: facilityId
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

function calcLOS(admittedAt: Date, dischargedAt: Date | null): number {
  const end = dischargedAt ? new Date(dischargedAt) : new Date();
  const start = new Date(admittedAt);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_VIEW) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;

  // Today's date range
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [
    totalAdmissions,
    currentInpatients,
    todayAdmissions,
    todayDischarges,
    pendingRequests,
    awaitingBeds,
    plannedDischarges,
    cancelledToday,
    transfersToday,
  ] = await Promise.all([
    db.admission.count({ where }),
    db.admission.count({ where: { ...where, status: "admitted" } }),
    db.admission.count({ where: { ...where, admittedAt: { gte: todayStart, lte: todayEnd } } }),
    db.admission.count({ where: { ...where, dischargedAt: { gte: todayStart, lte: todayEnd } } }),
    db.admission.count({ where: { ...where, status: { in: ["requested", "pending_approval"] } } }),
    db.admission.count({ where: { ...where, status: { in: ["approved", "awaiting_bed"] } } }),
    db.admission.count({ where: { ...where, status: "discharge_planned" } }),
    db.admission.count({ where: { ...where, status: "cancelled", cancelledAt: { gte: todayStart, lte: todayEnd } } }),
    db.patientTransfer.count({ where: { ...(facilityId ? { fromFacilityId: facilityId } : {}), requestedAt: { gte: todayStart, lte: todayEnd } } }),
  ]);

  // Admission type breakdown
  const byTypeRaw = await db.admission.groupBy({
    by: ["admissionType"],
    where: { ...where, status: "admitted" },
    _count: true,
  });
  const byType = byTypeRaw.map((r) => ({ label: r.admissionType || "unspecified", count: r._count }));

  // Source breakdown
  const bySourceRaw = await db.admission.groupBy({
    by: ["admissionSource"],
    where: { ...where, status: "admitted" },
    _count: true,
  });
  const bySource = bySourceRaw.map((r) => ({ label: r.admissionSource || "unspecified", count: r._count }));

  // LOS calculation for discharged patients (last 30 days)
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dischargedForLOS = await db.admission.findMany({
    where: { ...where, status: "discharged", dischargedAt: { gte: thirtyDaysAgo } },
    select: { admittedAt: true, dischargedAt: true },
    take: 200,
  });
  const losValues = dischargedForLOS.map((a) => calcLOS(a.admittedAt, a.dischargedAt));
  const avgLOS = losValues.length > 0 ? Math.round(losValues.reduce((s, v) => s + v, 0) / losValues.length * 10) / 10 : 0;

  // Bed stats
  const beds = await db.bed.findMany({
    where: facilityId ? { facilityId } : {},
    select: { id: true, status: true },
  });
  const bedStats = {
    total: beds.length,
    available: beds.filter((b) => b.status === "available").length,
    occupied: beds.filter((b) => b.status === "occupied").length,
    reserved: beds.filter((b) => b.status === "reserved").length,
    cleaning: beds.filter((b) => b.status === "cleaning").length,
    maintenance: beds.filter((b) => b.status === "maintenance").length,
    outOfService: beds.filter((b) => b.status === "out_of_service").length,
  };
  const operationalBeds = beds.filter((b) => ["available", "occupied", "reserved", "cleaning"].includes(b.status)).length;
  const occupancyRate = operationalBeds > 0 ? Math.round((bedStats.occupied / operationalBeds) * 100) : 0;

  // Ward-level census
  const wards = await db.ward.findMany({
    where: facilityId ? { facilityId } : {},
    include: {
      beds: { select: { id: true, status: true } },
      bedAssignments: { where: { status: "active" }, select: { id: true } },
    },
  });
  const wardCensus = wards.map((w) => ({
    id: w.id,
    name: w.name,
    code: w.code,
    totalBeds: w.beds.length,
    occupied: w.beds.filter((b) => b.status === "occupied").length,
    available: w.beds.filter((b) => b.status === "available").length,
    reserved: w.beds.filter((b) => b.status === "reserved").length,
    occupancyRate: w.beds.length > 0 ? Math.round((w.beds.filter((b) => b.status === "occupied").length / w.beds.length) * 100) : 0,
  }));

  return NextResponse.json({
    totalAdmissions,
    currentInpatients,
    todayAdmissions,
    todayDischarges,
    pendingRequests,
    awaitingBeds,
    plannedDischarges,
    cancelledToday,
    transfersToday,
    byType,
    bySource,
    avgLOS,
    bedStats,
    occupancyRate,
    wardCensus,
  });
}
