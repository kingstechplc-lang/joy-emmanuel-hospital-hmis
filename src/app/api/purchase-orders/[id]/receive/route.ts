// =====================================================================
// API: /api/purchase-orders/[id]/receive
//   POST — Receive goods for a PO (TRANSACTIONAL)
//
// Body: {
//   referenceNumber?, notes?,
//   items: [{
//     purchaseOrderItemId, receivedQuantity, rejectedQuantity?,
//     batchNumber, expiryDate?, costPrice?, sellingPrice?
//   }]
// }
//
// Effects:
//   1. Create GoodsReceived header record
//   2. For each item:
//      a) Find or create FacilityInventory for inventoryItem @ facility
//      b) Create InventoryBatch (batchNumber, expiry, quantity, cost/sell price)
//      c) Increment facility_inventory.currentQuantity (by received qty)
//      d) Create InventoryTransaction (type=receive, quantity=+received)
//      e) Update PurchaseOrderItem.receivedQuantity / rejectedQuantity (NEW)
//   3. Update PO status (fully_received if all items fully received,
//      else partially_received) and roll up totalReceived (NEW)
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
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
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
  // Support both legacy ("received") and new ("fully_received") status codes
  if (po.status === "received" || po.status === "fully_received") {
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

    const itemResults: Array<{ poi: any; receivedQty: number; rejectedQty: number; batch: any; txn: any; updatedInv: any; receivedValue: number }> = [];
    let accumulatedReceivedValue = 0;

    for (const recv of items) {
      const poi = po.items.find((i) => i.id === recv.purchaseOrderItemId);
      if (!poi) {
        throw new Error(`PO item ${recv.purchaseOrderItemId} not found on this PO`);
      }

      const receivedQty = Number(recv.receivedQuantity);
      if (!receivedQty || receivedQty <= 0) {
        throw new Error("receivedQuantity must be a positive number");
      }
      const rejectedQty = Math.max(0, Math.floor(Number(recv.rejectedQuantity) || 0));

      // 2a. Find or create facility inventory (only for stock items)
      let fi: any = null;
      if (poi.inventoryItemId) {
        fi = await tx.facilityInventory.findUnique({
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
      }

      // 2b. Create batch
      const batch = fi
        ? await tx.inventoryBatch.create({
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
          })
        : null;

      // 2c. Increment facility inventory
      const updatedInv = fi
        ? await tx.facilityInventory.update({
            where: { id: fi.id },
            data: { currentQuantity: { increment: receivedQty } },
          })
        : null;

      // 2d. Create InventoryTransaction (receive)
      const txn = poi.inventoryItemId
        ? await tx.inventoryTransaction.create({
            data: {
              facilityId,
              inventoryItemId: poi.inventoryItemId,
              batchId: batch?.id || null,
              transactionType: "receive",
              quantity: receivedQty,
              referenceType: "purchase_order",
              referenceId: id,
              performedById: session.user.id,
              transactionAt: new Date(),
              notes: `Goods received: PO ${po.purchaseOrderNumber} — GRN ${grn.id}`,
            },
          })
        : null;

      // 2e. Update PurchaseOrderItem rollup (NEW — receivedQuantity & rejectedQuantity)
      const updatedPoi = await tx.purchaseOrderItem.update({
        where: { id: poi.id },
        data: {
          receivedQuantity: { increment: receivedQty },
          rejectedQuantity: { increment: rejectedQty },
        },
      });

      const lineReceivedValue = receivedQty * (Number(poi.unitPrice) || 0);
      accumulatedReceivedValue += lineReceivedValue;

      itemResults.push({ poi: updatedPoi, receivedQty, rejectedQty, batch, txn, updatedInv, receivedValue: lineReceivedValue });
    }

    // 3. Update PO status + totalReceived rollup
    //    All items fully received if every line's cumulative receivedQty >= ordered qty.
    const allThisGrnFull = itemResults.every((r) => (r.poi.receivedQuantity || 0) >= (r.poi.quantity || 0));
    let newStatus: string;
    if (allThisGrnFull) {
      newStatus = "fully_received";
      // Backwards-compat alias for callers that check "received"
    } else {
      newStatus = "partially_received";
    }

    const updatedPo = await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: newStatus,
        totalReceived: { increment: accumulatedReceivedValue },
        actualDeliveryDate: new Date(),
      },
    });

    return { grn, itemResults, allFullyReceived: allThisGrnFull, updatedPo };
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
      poStatus: result.allFullyReceived ? "fully_received" : "partially_received",
      receivedValue: result.itemResults.reduce((s, r) => s + r.receivedValue, 0),
    },
  });

  return NextResponse.json({ ...result }, { status: 201 });
}
