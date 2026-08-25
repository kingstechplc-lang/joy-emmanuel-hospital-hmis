// =====================================================================
// API: /api/beds/stats
//   GET — bed management dashboard with occupancy analytics
//   Query: facilityId
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
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_VIEW) &&
      !session.user.permissions?.includes(PERMISSIONS.BED_MANAGE) &&
      !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;

  const where: any = { lifecycleStatus: "active" };
  if (facilityId) where.facilityId = facilityId;

  const beds = await db.bed.findMany({
    where,
    select: {
      id: true, status: true, bedType: true, wardId: true,
      isolationCapable: true, oxygen: true, ventilator: true,
      genderRestriction: true,
    },
  });

  const total = beds.length;
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const b of beds) {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
    byType[b.bedType || "unspecified"] = (byType[b.bedType || "unspecified"] || 0) + 1;
  }

  const operational = beds.filter((b) => !["out_of_service", "maintenance", "blocked"].includes(b.status)).length;
  const occupied = byStatus["occupied"] || 0;
  const available = byStatus["available"] || 0;
  const reserved = byStatus["reserved"] || 0;
  const cleaning = byStatus["cleaning"] || 0;
  const maintenance = byStatus["maintenance"] || 0;
  const blocked = byStatus["blocked"] || 0;
  const outOfService = byStatus["out_of_service"] || 0;
  const isolation = byStatus["isolation"] || 0;
  const temporarilyUnavailable = byStatus["temporarily_unavailable"] || 0;

  const occupancyRate = operational > 0 ? Math.round((occupied / operational) * 100) : 0;

  // Capability stats
  const isolationCapable = beds.filter((b) => b.isolationCapable).length;
  const oxygenCapable = beds.filter((b) => b.oxygen).length;
  const ventilatorCapable = beds.filter((b) => b.ventilator).length;

  // Active reservations count
  const activeReservations = await db.bedReservation.count({
    where: { status: "active", ...(facilityId ? { facilityId } : {}) },
  });

  // Pending cleaning
  const pendingCleaning = await db.bedCleaning.count({
    where: { status: { in: ["pending", "in_progress"] }, ...(facilityId ? { facilityId } : {}) },
  });

  // Active maintenance
  const activeMaintenance = await db.bedMaintenance.count({
    where: { status: { in: ["reported", "in_progress"] }, ...(facilityId ? { facilityId } : {}) },
  });

  // Active blocks
  const activeBlocks = await db.bedBlock.count({
    where: { status: "active", ...(facilityId ? { facilityId } : {}) },
  });

  // Ward-level stats
  const wards = await db.ward.findMany({
    where: facilityId ? { facilityId } : {},
    include: {
      beds: { select: { id: true, status: true } },
    },
  });
  const wardStats = wards.map((w) => {
    const wBeds = w.beds.filter((b) => true); // include all lifecycle statuses for ward view
    const wOperational = wBeds.filter((b) => !["out_of_service", "maintenance", "blocked"].includes(b.status)).length;
    const wOccupied = wBeds.filter((b) => b.status === "occupied").length;
    return {
      id: w.id,
      name: w.name,
      code: w.code,
      wardType: w.wardType,
      capacity: w.capacity,
      totalBeds: wBeds.length,
      occupied: wOccupied,
      available: wBeds.filter((b) => b.status === "available").length,
      reserved: wBeds.filter((b) => b.status === "reserved").length,
      cleaning: wBeds.filter((b) => b.status === "cleaning").length,
      maintenance: wBeds.filter((b) => b.status === "maintenance").length,
      blocked: wBeds.filter((b) => b.status === "blocked").length,
      occupancyRate: wOperational > 0 ? Math.round((wOccupied / wOperational) * 100) : 0,
    };
  });

  // Average LOS from discharged admissions (last 30 days)
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dischargedAdmissions = await db.admission.findMany({
    where: {
      status: "discharged",
      dischargedAt: { gte: thirtyDaysAgo },
      ...(facilityId ? { facilityId } : {}),
    },
    select: { admittedAt: true, dischargedAt: true },
    take: 200,
  });
  const losValues = dischargedAdmissions.map((a) => {
    if (!a.dischargedAt) return 0;
    return Math.max(0, Math.floor((new Date(a.dischargedAt).getTime() - new Date(a.admittedAt).getTime()) / (24 * 60 * 60 * 1000)));
  });
  const avgLOS = losValues.length > 0 ? Math.round(losValues.reduce((s, v) => s + v, 0) / losValues.length * 10) / 10 : 0;

  // Bed turnover = discharges in period / operational beds
  const bedTurnover = operational > 0 ? Math.round((dischargedAdmissions.length / operational) * 10) / 10 : 0;

  return NextResponse.json({
    total,
    operational,
    occupied,
    available,
    reserved,
    cleaning,
    maintenance,
    blocked,
    outOfService,
    isolation,
    temporarilyUnavailable,
    occupancyRate,
    avgLOS,
    bedTurnover,
    isolationCapable,
    oxygenCapable,
    ventilatorCapable,
    activeReservations,
    pendingCleaning,
    activeMaintenance,
    activeBlocks,
    byStatus,
    byType,
    wardStats,
  });
}
