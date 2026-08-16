// =====================================================================
// API: /api/wards
//   GET — list wards (with bed counts grouped by status)
//         Filter: ?facilityId=...&status=...
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
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW) && !hasPermission(session, PERMISSIONS.BED_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;

  const wards = await db.ward.findMany({
    where,
    orderBy: [{ facilityId: "asc" }, { name: "asc" }],
    include: {
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true } },
      rooms: { select: { id: true, roomNumber: true, roomType: true, capacity: true, status: true } },
      _count: { select: { beds: true } },
    },
  });

  // Add bed occupancy stats per ward
  const enriched = await Promise.all(
    wards.map(async (w) => {
      const beds = await db.bed.groupBy({
        by: ["status"],
        where: { wardId: w.id },
        _count: true,
      });
      const occupiedCount = beds.find((b) => b.status === "occupied")?._count || 0;
      const availableCount = beds.find((b) => b.status === "available")?._count || 0;
      const reservedCount = beds.find((b) => b.status === "reserved")?._count || 0;
      const maintenanceCount = beds.find((b) => b.status === "maintenance")?._count || 0;
      const cleaningCount = beds.find((b) => b.status === "cleaning")?._count || 0;
      return {
        ...w,
        bedStats: { occupied: occupiedCount, available: availableCount, reserved: reservedCount, maintenance: maintenanceCount, cleaning: cleaningCount, total: w._count.beds },
      };
    })
  );

  return NextResponse.json({ items: enriched, count: enriched.length });
}
