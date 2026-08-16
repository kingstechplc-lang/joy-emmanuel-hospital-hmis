// =====================================================================
// API: /api/purchase-orders/[id]/receive
//   POST — Receive goods for a PO (TRANSACTIONAL)
//
// Body: {
//   referenceNumber?, notes?,
//   items: [{ purchaseOrderItemId, receivedQuantity, batchNumber, expiryDate?, costPrice?, sellingPrice? }]
// }
//
// Effects:
//   1. Create GoodsReceived header record
//   2. For each item:
//      a) Find or create FacilityInventory for inventoryItem @ facility
//      b) Create InventoryBatch (batchNumber, expiry, quantity, cost/sell price)
//      c) Increment facility_inventory.currentQuantity
//      d) Create InventoryTransaction (type=receive, quantity=+received)
//   3. Update PO status (received if all items fully received, else partially_received)
//   4. Audit log
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_RECEIVE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { referenceNumber, notes, items } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items array is required" }, { status: 400 });
  }

  // Load the PO with items
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: { items: true, supplier: true },
  });
  if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

  if (po.status === "cancelled") {
    return NextResponse.json({ error: "Cannot receive against a cancelled PO" }, { status: 400 });
  }
  if (po.status === "received") {
    return NextResponse.json({ error: "PO already fully received" }, { status: 400 });
  }

  const facilityId = po.facilityId;
  const supplierId = po.supplierId;

  const result = await db.$transaction(async (tx) => {
    // 1. Create GoodsReceived header
    const grn = await tx.goodsReceived.create({
      data: {
        purchaseOrderId: id,
        facilityId,
        receivedById: session.user.id,
        receivedAt: new Date(),
        referenceNumber: referenceNumber || null,
        notes: notes || null,
      },
    });

    const itemResults: Array<{ poi: any; receivedQty: number; batch: any; txn: any; updatedInv: any }> = [];
    let allFullyReceived = true;

    for (const recv of items) {
      const poi = po.items.find((i) => i.id === recv.purchaseOrderItemId);
      if (!poi) {
        throw new Error(`PO item ${recv.purchaseOrderItemId} not found on this PO`);
      }

      const receivedQty = Number(recv.receivedQuantity);
      if (!receivedQty || receivedQty <= 0) {
        throw new Error("receivedQuantity must be a positive number");
      }

      // 2a. Find or create facility inventory
      let fi = await tx.facilityInventory.findUnique({
        where: { facilityId_inventoryItemId: { facilityId, inventoryItemId: poi.inventoryItemId } },
      });
      if (!fi) {
        fi = await tx.facilityInventory.create({
          data: {
            facilityId,
            inventoryItemId: poi.inventoryItemId,
            currentQuantity: 0,
            minimumQuantity: 0,
            maximumQuantity: 0,
          },
        });
      }

      // 2b. Create batch
      const batch = await tx.inventoryBatch.create({
        data: {
          facilityInventoryId: fi.id,
          batchNumber: recv.batchNumber || `BATCH-${Date.now()}`,
          expiryDate: recv.expiryDate ? new Date(recv.expiryDate) : null,
          quantity: receivedQty,
          costPrice: Number(recv.costPrice ?? poi.unitPrice) || 0,
          sellingPrice: Number(recv.sellingPrice ?? poi.unitPrice * 1.2) || 0,
          supplierId: supplierId || null,
          receivedAt: new Date(),
          status: "active",
        },
      });

      // 2c. Increment facility inventory
      const updatedInv = await tx.facilityInventory.update({
        where: { id: fi.id },
        data: { currentQuantity: { increment: receivedQty } },
      });

      // 2d. Create InventoryTransaction (receive)
      const txn = await tx.inventoryTransaction.create({
        data: {
          facilityId,
          inventoryItemId: poi.inventoryItemId,
          batchId: batch.id,
          transactionType: "receive",
          quantity: receivedQty,
          referenceType: "purchase_order",
          referenceId: id,
          performedById: session.user.id,
          transactionAt: new Date(),
          notes: `Goods received: PO ${po.purchaseOrderNumber} — GRN ${grn.id}`,
        },
      });

      itemResults.push({ poi, receivedQty, batch, txn, updatedInv });
    }

    // 3. Update PO status
    // We can't easily track per-item received quantity without a column on POItem.
    // Instead, mark PO as "partially_received" if there are still items to receive,
    // or "received" if all items were fully received in this batch.
    // For simplicity: if all items in this GRN have receivedQty >= poi.quantity, mark as received.
    const allThisGrnFull = itemResults.every((r) => r.receivedQty >= r.poi.quantity);
    if (allThisGrnFull && po.items.length === items.length) {
      allFullyReceived = true;
      await tx.purchaseOrder.update({
        where: { id },
        data: { status: "received" },
      });
    } else {
      allFullyReceived = false;
      await tx.purchaseOrder.update({
        where: { id },
        data: { status: "partially_received" },
      });
    }

    return { grn, itemResults, allFullyReceived };
  }).catch((err) => ({ error: err.message }));

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "GOODS_RECEIVED",
    resourceType: "goods_received",
    resourceId: result.grn.id,
    newValues: {
      purchaseOrderId: id,
      purchaseOrderNumber: po.purchaseOrderNumber,
      itemCount: result.itemResults.length,
      poStatus: result.allFullyReceived ? "received" : "partially_received",
    },
  });

  return NextResponse.json({ ...result }, { status: 201 });
}
