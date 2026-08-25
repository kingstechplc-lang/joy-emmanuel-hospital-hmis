// =====================================================================
// API: /api/wards
//   GET  — list wards (with bed counts grouped by status)
//          Filter: ?facilityId=...&status=...
//   POST — create a new ward
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW) && !hasPermission(session, PERMISSIONS.BED_VIEW) && !hasPermission(session, PERMISSIONS.BED_MANAGE)) {
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
      const blockedCount = beds.find((b) => b.status === "blocked")?._count || 0;
      return {
        ...w,
        bedStats: { occupied: occupiedCount, available: availableCount, reserved: reservedCount, maintenance: maintenanceCount, cleaning: cleaningCount, blocked: blockedCount, total: w._count.beds },
      };
    })
  );

  return NextResponse.json({ items: enriched, count: enriched.length });
}

// POST /api/wards — create a new ward
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BED_CREATE) && !hasPermission(session, PERMISSIONS.BED_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden — missing bed.create permission" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { facilityId, departmentId, name, code, wardType, genderPolicy, capacity, status } = body;

  if (!facilityId || !name || !code) {
    return NextResponse.json({ error: "facilityId, name, and code are required" }, { status: 400 });
  }

  // Check for duplicate code within facility
  const existing = await db.ward.findFirst({ where: { facilityId, code } });
  if (existing) {
    return NextResponse.json({ error: "Ward with this code already exists in this facility" }, { status: 409 });
  }

  const ward = await db.ward.create({
    data: {
      facilityId,
      departmentId: departmentId || null,
      name,
      code,
      wardType: wardType || "general",
      genderPolicy: genderPolicy || "mixed",
      capacity: typeof capacity === "number" ? capacity : 0,
      status: status || "active",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "WARD_CREATED",
    resourceType: "ward",
    resourceId: ward.id,
    newValues: { name, code, wardType, facilityId },
  });

  return NextResponse.json({ item: ward }, { status: 201 });
}
