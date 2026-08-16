// =====================================================================
// API: /api/inventory/[id]
//   GET   — full details with facility inventory + batches
//   PATCH — update basic fields
//   DELETE — soft delete (status=inactive)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;

  const item = await db.inventoryItem.findUnique({
    where: { id },
    include: {
      medication: true,
      facilityInventory: facilityId
        ? { where: { facilityId }, include: { batches: { orderBy: { expiryDate: "asc" } } } }
        : { include: { facility: { select: { id: true, name: true } }, batches: { orderBy: { expiryDate: "asc" } } } },
    },
  });

  if (!item) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });

  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_ADJUST)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const existing = await db.inventoryItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.sku !== undefined) data.sku = body.sku;
  if (body.itemType !== undefined) data.itemType = body.itemType;
  if (body.category !== undefined) data.category = body.category;
  if (body.unit !== undefined) data.unit = body.unit;
  if (body.description !== undefined) data.description = body.description;
  if (body.reorderLevel !== undefined) data.reorderLevel = Number(body.reorderLevel) || 0;
  if (body.status !== undefined) data.status = body.status;

  const updated = await db.inventoryItem.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "INVENTORY_ITEM_UPDATED",
    resourceType: "inventory_item",
    resourceId: id,
    oldValues: existing,
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_ADJUST)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.inventoryItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });

  // Soft delete
  const updated = await db.inventoryItem.update({
    where: { id },
    data: { status: "inactive" },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "INVENTORY_ITEM_DEACTIVATED",
    resourceType: "inventory_item",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: { status: "inactive" },
  });

  return NextResponse.json({ item: updated });
}
