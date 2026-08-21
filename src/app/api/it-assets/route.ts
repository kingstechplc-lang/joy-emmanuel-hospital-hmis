// =====================================================================
// API: /api/it-assets
//   GET  — list IT assets (filter by facility, type, status)
//   POST — create IT asset (IT_MANAGE)
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
  if (!hasPermission(session, PERMISSIONS.IT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const assetType = url.searchParams.get("assetType");
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) where.facilityId = facilityId;
  else where.facilityId = { in: orgFacilityIds };
  if (assetType && assetType !== "all") where.assetType = assetType;
  if (status && status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { assetTag: { contains: search, mode: "insensitive" } },
      { manufacturer: { contains: search, mode: "insensitive" } },
      { model: { contains: search, mode: "insensitive" } },
      { serialNumber: { contains: search, mode: "insensitive" } },
      { assignedToName: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await db.iTAsset.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { _count: { select: { tickets: true } } },
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { assetType, manufacturer, model, serialNumber } = body;
  if (!assetType) {
    return NextResponse.json({ error: "assetType is required" }, { status: 400 });
  }

  // Generate asset tag
  const count = await db.iTAsset.count({ where: { organizationId: session.user.organizationId } });
  const year = new Date().getFullYear();
  const assetTag = `IT-${year}-${String(count + 1).padStart(5, "0")}`;

  const item = await db.iTAsset.create({
    data: {
      ...body,
      assetTag,
      organizationId: session.user.organizationId,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "IT_ASSET_CREATED",
    resourceType: "it_asset",
    resourceId: item.id,
    newValues: { assetTag, assetType, manufacturer, model },
  });

  return NextResponse.json({ item }, { status: 201 });
}
