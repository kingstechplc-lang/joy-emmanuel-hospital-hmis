// =====================================================================
// API: /api/inventory
//   GET  — list inventory items (org-level, with optional facility stock join)
//   POST — create new inventory item (org-level)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

// GET /api/inventory?facilityId=...&type=...&category=...&lowStockOnly=true&q=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const type = url.searchParams.get("type") || undefined;
  const category = url.searchParams.get("category") || undefined;
  const lowStockOnly = url.searchParams.get("lowStockOnly") === "true";
  const q = url.searchParams.get("q") || undefined;

  const where: any = { organizationId: session.user.organizationId, status: "active" };
  if (type && type !== "all") where.itemType = type;
  if (category && category !== "all") where.category = category;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { sku: { contains: q } },
      { description: { contains: q } },
    ];
  }

  // Get items + their facility inventory (if facilityId provided)
  const items = await db.inventoryItem.findMany({
    where,
    orderBy: { name: "asc" },
    take: 300,
    include: {
      medication: { select: { id: true, genericName: true, brandName: true, strength: true, dosageForm: true } },
      facilityInventory: facilityId
        ? { where: { facilityId }, include: { batches: { where: { quantity: { gt: 0 } }, orderBy: { expiryDate: "asc" } } } }
        : false,
    },
  });

  // Compute current stock + flag low/out-of-stock per item
  const computed = items.map((it: any) => {
    const fi = it.facilityInventory?.[0] || null;
    const currentQty = fi?.currentQuantity ?? 0;
    const minQty = fi?.minimumQuantity ?? it.reorderLevel ?? 0;
    const maxQty = fi?.maximumQuantity ?? 0;
    const batches = fi?.batches || [];

    let stockStatus = "in_stock";
    if (currentQty <= 0) stockStatus = "out_of_stock";
    else if (minQty > 0 && currentQty <= minQty) stockStatus = "low_stock";

    const showInList = !lowStockOnly || stockStatus !== "in_stock";

    return {
      id: it.id,
      name: it.name,
      sku: it.sku,
      itemType: it.itemType,
      category: it.category,
      unit: it.unit,
      description: it.description,
      reorderLevel: it.reorderLevel,
      medication: it.medication,
      facilityInventoryId: fi?.id || null,
      currentQuantity: currentQty,
      minimumQuantity: minQty,
      maximumQuantity: maxQty,
      storageLocation: fi?.storageLocation || null,
      stockStatus,
      batches,
      _show: showInList,
    };
  }).filter((it: any) => it._show);

  return NextResponse.json({ items: computed, count: computed.length, facilityId });
}

// POST /api/inventory
// Body: { name, sku, itemType, category?, unit?, description?, reorderLevel?, medicationId? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_ADJUST)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, sku, itemType, category, unit, description, reorderLevel, medicationId } = body;

  if (!name || !sku || !itemType) {
    return NextResponse.json({ error: "name, sku, itemType are required" }, { status: 400 });
  }

  // Check SKU uniqueness within org
  const existing = await db.inventoryItem.findFirst({
    where: { organizationId: session.user.organizationId, sku },
  });
  if (existing) {
    return NextResponse.json({ error: "SKU already exists in this organization" }, { status: 409 });
  }

  const item = await db.inventoryItem.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      sku,
      itemType,
      category: category || null,
      unit: unit || null,
      description: description || null,
      reorderLevel: Number(reorderLevel) || 0,
      medicationId: medicationId || null,
      status: "active",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "INVENTORY_ITEM_CREATED",
    resourceType: "inventory_item",
    resourceId: item.id,
    newValues: { name, sku, itemType, category, unit, reorderLevel },
  });

  return NextResponse.json({ item }, { status: 201 });
}
