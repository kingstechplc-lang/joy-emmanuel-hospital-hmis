// =====================================================================
// API: /api/ambulance/stats
//   GET — ambulance dashboard KPIs
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
  if (!hasPermission(session, PERMISSIONS.AMBULANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId;
  if (!facilityId) {
    return NextResponse.json({ kpis: {}, byStatus: {}, byType: {} });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalVehicles, availableVehicles, dispatchedVehicles, onTripVehicles, maintenanceVehicles,
    pendingRequests, emergencyRequests, completedToday, cancelledToday, totalTrips,
    byStatusRaw, byTypeRaw,
  ] = await Promise.all([
    db.ambulanceVehicle.count({ where: { facilityId, status: { not: "out_of_service" } } }),
    db.ambulanceVehicle.count({ where: { facilityId, status: "available" } }),
    db.ambulanceVehicle.count({ where: { facilityId, status: "dispatched" } }),
    db.ambulanceVehicle.count({ where: { facilityId, status: { in: ["on_trip", "returning"] } } }),
    db.ambulanceVehicle.count({ where: { facilityId, status: "maintenance" } }),
    db.ambulanceTrip.count({ where: { facilityId, status: "requested" } }),
    db.ambulanceTrip.count({ where: { facilityId, status: "requested", priority: { in: ["critical", "high"] } } }),
    db.ambulanceTrip.count({ where: { facilityId, status: "completed", completedAt: { gte: todayStart } } }),
    db.ambulanceTrip.count({ where: { facilityId, status: "cancelled", cancelledAt: { gte: todayStart } } }),
    db.ambulanceTrip.count({ where: { facilityId, requestedAt: { gte: todayStart } } }),
    db.ambulanceTrip.groupBy({ by: ["status"], where: { facilityId }, _count: true }),
    db.ambulanceTrip.groupBy({ by: ["requestType"], where: { facilityId, requestedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }, _count: true }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const g of byStatusRaw) byStatus[g.status] = g._count;
  const byType: Record<string, number> = {};
  for (const g of byTypeRaw) byType[g.requestType] = g._count;

  return NextResponse.json({
    kpis: {
      totalVehicles, availableVehicles, dispatchedVehicles, onTripVehicles, maintenanceVehicles,
      pendingRequests, emergencyRequests, completedToday, cancelledToday, totalTrips,
    },
    byStatus, byType,
  });
}
