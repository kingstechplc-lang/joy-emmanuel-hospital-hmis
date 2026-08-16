// =====================================================================
// API: /api/equipment
//   GET  — list equipment (org or facility-scoped)
//   POST — create new equipment record
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/equipment?facilityId=...&category=...&status=active&q=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const category = url.searchParams.get("category") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const q = url.searchParams.get("q") || undefined;

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (category && category !== "all") where.category = category;
  if (status && status !== "all") where.status = status;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { assetNumber: { contains: q } },
      { manufacturer: { contains: q } },
      { model: { contains: q } },
      { serialNumber: { contains: q } },
    ];
  }

  const equipment = await db.equipment.findMany({
    where,
    orderBy: { name: "asc" },
    take: 300,
    include: {
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      _count: { select: { maintenance: true } },
    },
  });

  return NextResponse.json({ items: equipment, count: equipment.length });
}

// POST /api/equipment
// Body: { facilityId?, departmentId?, assetNumber, name, category?, manufacturer?, model?, serialNumber?, purchaseDate?, purchasePrice?, warrantyExpiry?, status?, location? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_ADJUST)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    facilityId, departmentId, assetNumber, name, category,
    manufacturer, model, serialNumber, purchaseDate, purchasePrice,
    warrantyExpiry, status, location,
  } = body;

  if (!assetNumber || !name) {
    return NextResponse.json({ error: "assetNumber and name are required" }, { status: 400 });
  }

  // Check asset number uniqueness
  const existing = await db.equipment.findFirst({
    where: { organizationId: session.user.organizationId, assetNumber },
  });
  if (existing) {
    return NextResponse.json({ error: "Asset number already exists in this organization" }, { status: 409 });
  }

  const equipment = await db.equipment.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null,
      departmentId: departmentId || null,
      assetNumber,
      name,
      category: category || null,
      manufacturer: manufacturer || null,
      model: model || null,
      serialNumber: serialNumber || null,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
      purchasePrice: purchasePrice ? Number(purchasePrice) : null,
      warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
      status: status || "active",
      location: location || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: facilityId || session.user.facilityId || undefined,
    action: "EQUIPMENT_CREATED",
    resourceType: "equipment",
    resourceId: equipment.id,
    newValues: { assetNumber, name, category, manufacturer, model, status },
  });

  return NextResponse.json({ item: equipment }, { status: 201 });
}
