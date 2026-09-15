// =====================================================================
// API: /api/inventory/auto-reorder
//   POST — auto-generate draft PurchaseOrders for items below par level
//
// Groups items by supplier, creates one PO per supplier with all their
// low-stock items. Returns the created POs.
//
// Permission: inventory.manage (or inventory.create)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";
import { getClientIp } from "@/lib/session";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "inventory.manage")) {
    return NextResponse.json({ error: "Forbidden — requires inventory.manage" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityParam = url.searchParams.get("facilityId");
  const isSuperAdmin = session.user.roles.includes("super_admin");
  const facilityId = isSuperAdmin
    ? (facilityParam || undefined)
    : (session.user.facilityId || facilityParam || undefined);

  if (!facilityId) {
    return NextResponse.json({ error: "Facility ID is required to create purchase orders" }, { status: 400 });
  }

  try {
    // Fetch facility inventory items below par level
    const facilityInventory = await db.facilityInventory.findMany({
      where: { facilityId },
      include: {
        inventoryItem: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            reorderLevel: true,
            reorderQuantity: true,
            safetyStock: true,
            preferredSupplierId: true,
            status: true,
          },
        },
      },
    });

    // Group by supplier
    const bySupplier: Record<string, any[]> = {};
    let skippedNoSupplier = 0;
    let skippedHealthy = 0;

    for (const fi of facilityInventory) {
      const item = fi.inventoryItem;
      if (!item || item.status !== "active") continue;

      const currentQty = fi.currentQuantity - fi.reservedQuantity;
      const reorderLevel = fi.minimumQuantity || item.reorderLevel || 0;

      // Skip if above reorder level
      if (currentQty > reorderLevel) {
        skippedHealthy++;
        continue;
      }

      // Skip if no preferred supplier
      if (!item.preferredSupplierId) {
        skippedNoSupplier++;
        continue;
      }

      if (!bySupplier[item.preferredSupplierId]) {
        bySupplier[item.preferredSupplierId] = [];
      }
      bySupplier[item.preferredSupplierId].push({
        inventoryItemId: item.id,
        itemName: item.name,
        sku: item.sku,
        unit: item.unit,
        currentQty,
        reorderLevel,
        reorderQty: item.reorderQuantity || Math.max(item.reorderLevel * 2, 10),
        facilityInventoryId: fi.id,
        lastCostPrice: fi.lastCostPrice,
      });
    }

    // Create one PurchaseOrder per supplier
    const createdPOs: any[] = [];
    const supplierIds = Object.keys(bySupplier);

    for (const supplierId of supplierIds) {
      const items = bySupplier[supplierId];
      const totalItems = items.length;

      // Generate PO number
      const poCount = await db.purchaseOrder.count({ where: { facilityId } });
      const year = new Date().getFullYear();
      const poNumber = `PO-${year}-${String(poCount + 1).padStart(6, "0")}`;

      // Look up supplier
      const supplier = await db.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, name: true, code: true },
      });

      if (!supplier) continue;

      // Create the PO + items
      const po = await db.purchaseOrder.create({
        data: {
          poNumber,
          facilityId,
          supplierId,
          status: "draft",
          priority: items.some((i: any) => i.currentQty <= 0) ? "urgent" : "routine",
          notes: `Auto-generated from inventory par-level alert. ${totalItems} item(s) below reorder level.`,
          createdById: session.user.id,
          // Create PO items
          items: {
            create: items.map((item: any) => ({
              inventoryItemId: item.inventoryItemId,
              quantity: item.reorderQty,
              unitPrice: item.lastCostPrice,
              notes: `Current: ${item.currentQty} ${item.unit || ""}, Reorder at: ${item.reorderLevel}`,
            })),
          },
        },
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          items: { include: { inventoryItem: { select: { id: true, name: true, sku: true } } } },
        },
      });

      createdPOs.push({
        poId: po.id,
        poNumber: po.poNumber,
        supplierName: supplier.name,
        supplierCode: supplier.code,
        itemCount: totalItems,
        priority: po.priority,
      });
    }

    // Audit log
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId,
      action: "INVENTORY_AUTO_REORDER",
      actionCategory: "INVENTORY",
      severity: "notice",
      source: "inventory",
      resourceType: "purchase_order",
      newValues: {
        posCreated: createdPOs.length,
        itemsReordered: createdPOs.reduce((sum, po) => sum + po.itemCount, 0),
        skippedNoSupplier,
        skippedHealthy,
      },
      ipAddress: getClientIp(req) || undefined,
      reason: `Auto-generated ${createdPOs.length} purchase order(s) for ${supplierIds.length} supplier(s)`,
    });

    return NextResponse.json({
      created: createdPOs,
      summary: {
        posCreated: createdPOs.length,
        itemsReordered: createdPOs.reduce((sum, po) => sum + po.itemCount, 0),
        suppliersInvolved: supplierIds.length,
        skippedNoSupplier,
        skippedHealthy,
      },
    });
  } catch (e: any) {
    console.error("[POST /api/inventory/auto-reorder] error:", e);
    return NextResponse.json(
      { error: "Failed to auto-generate purchase orders", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
