// =====================================================================
// API: /api/stock-transfers/[id]
//   GET, PATCH (approve | ship | receive | cancel)
//
// receive — TRANSACTIONAL:
//   For each item:
//     - Decrement source FacilityInventory.currentQuantity
//     - Increment destination FacilityInventory.currentQuantity (create if missing)
//     - Create InventoryTransaction at source (transfer_out, qty=-qty)
//     - Create InventoryTransaction at destination (transfer_in, qty=+qty)
//     - Decrement batch.quantity at source (if batch specified)
//     - Increment/create batch at destination (if batch specified)
//   Update StockTransfer.status = received
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
  const t = await db.stockTransfer.findUnique({
    where: { id },
    include: {
      fromFacility: { select: { id: true, name: true, code: true } },
      toFacility: { select: { id: true, name: true, code: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      items: {
        include: {
          inventoryItem: { select: { id: true, name: true, sku: true, unit: true } },
        },
      },
    },
  });

  if (!t) return NextResponse.json({ error: "Stock transfer not found" }, { status: 404 });
  return NextResponse.json({ item: t });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_TRANSFER)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action } = body; // approve | ship | receive | cancel

  const existing = await db.stockTransfer.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!existing) return NextResponse.json({ error: "Stock transfer not found" }, { status: 404 });

  // ---- APPROVE ----
  if (action === "approve") {
    if (existing.status !== "requested") {
      return NextResponse.json({ error: "Only requested transfers can be approved" }, { status: 400 });
    }
    const updated = await db.stockTransfer.update({
      where: { id },
      data: { status: "approved", approvedById: session.user.id, approvedAt: new Date() },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.fromFacilityId,
      action: "STOCK_TRANSFER_APPROVED",
      resourceType: "stock_transfer",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "approved" },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- SHIP ----
  if (action === "ship") {
    if (existing.status !== "approved") {
      return NextResponse.json({ error: "Only approved transfers can be shipped" }, { status: 400 });
    }
    const updated = await db.stockTransfer.update({
      where: { id },
      data: { status: "shipped" },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.fromFacilityId,
      action: "STOCK_TRANSFER_SHIPPED",
      resourceType: "stock_transfer",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "shipped" },
    });
    return NextResponse.json({ item: updated });
  }

  // ---- RECEIVE (transactional) ----
  if (action === "receive") {
    if (existing.status !== "shipped") {
      return NextResponse.json({ error: "Only shipped transfers can be received" }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      const txnResults: Array<{ outTxn: any; inTxn: any; sourceFi: any; destFi: any }> = [];
      for (const it of existing.items) {
        // Find source facility inventory
        const sourceFi = await tx.facilityInventory.findUnique({
          where: { facilityId_inventoryItemId: { facilityId: existing.fromFacilityId, inventoryItemId: it.inventoryItemId } },
        });
        if (!sourceFi) {
          throw new Error(`Source facility has no inventory record for item ${it.inventoryItemId}`);
        }
        if (sourceFi.currentQuantity < it.quantity) {
          throw new Error(`Source facility only has ${sourceFi.currentQuantity} units of item (needs ${it.quantity})`);
        }

        // Decrement source
        const updatedSource = await tx.facilityInventory.update({
          where: { id: sourceFi.id },
          data: { currentQuantity: { decrement: it.quantity } },
        });

        // Update source batch if specified
        if (it.batchId) {
          const srcBatch = await tx.inventoryBatch.findUnique({ where: { id: it.batchId } });
          if (!srcBatch) throw new Error(`Source batch ${it.batchId} not found`);
          if (srcBatch.quantity < it.quantity) {
            throw new Error(`Source batch ${srcBatch.batchNumber} only has ${srcBatch.quantity} units (needs ${it.quantity})`);
          }
          await tx.inventoryBatch.update({
            where: { id: it.batchId },
            data: { quantity: { decrement: it.quantity } },
          });
        }

        // Create or update destination facility inventory
        let destFi = await tx.facilityInventory.findUnique({
          where: { facilityId_inventoryItemId: { facilityId: existing.toFacilityId, inventoryItemId: it.inventoryItemId } },
        });
        if (!destFi) {
          destFi = await tx.facilityInventory.create({
            data: {
              facilityId: existing.toFacilityId,
              inventoryItemId: it.inventoryItemId,
              currentQuantity: it.quantity,
              minimumQuantity: 0,
              maximumQuantity: 0,
              storageLocation: sourceFi.storageLocation || null,
            },
          });
        } else {
          destFi = await tx.facilityInventory.update({
            where: { id: destFi.id },
            data: { currentQuantity: { increment: it.quantity } },
          });
        }

        // Create or update destination batch if source batch was specified
        let destBatchId: string | null = null;
        if (it.batchId) {
          const srcBatch = await tx.inventoryBatch.findUnique({ where: { id: it.batchId } });
          if (srcBatch) {
            // Try to find an existing batch with the same batchNumber at destination
            let destBatch: Awaited<ReturnType<typeof tx.inventoryBatch.findFirst>> = await tx.inventoryBatch.findFirst({
              where: { facilityInventoryId: destFi.id, batchNumber: srcBatch.batchNumber },
            });
            if (!destBatch) {
              destBatch = await tx.inventoryBatch.create({
                data: {
                  facilityInventoryId: destFi.id,
                  batchNumber: srcBatch.batchNumber,
                  expiryDate: srcBatch.expiryDate,
                  quantity: it.quantity,
                  costPrice: srcBatch.costPrice,
                  sellingPrice: srcBatch.sellingPrice,
                  supplierId: srcBatch.supplierId,
                  receivedAt: new Date(),
                  status: "active",
                },
              });
            } else {
              destBatch = await tx.inventoryBatch.update({
                where: { id: destBatch.id },
                data: { quantity: { increment: it.quantity } },
              });
            }
            destBatchId = destBatch.id;
          }
        }

        // Source InventoryTransaction (transfer_out)
        const outTxn = await tx.inventoryTransaction.create({
          data: {
            facilityId: existing.fromFacilityId,
            inventoryItemId: it.inventoryItemId,
            batchId: it.batchId || null,
            transactionType: "transfer_out",
            quantity: -it.quantity,
            referenceType: "stock_transfer",
            referenceId: id,
            performedById: session.user.id,
            transactionAt: new Date(),
            notes: `Transfer out: ${existing.transferNumber}`,
          },
        });

        // Destination InventoryTransaction (transfer_in)
        const inTxn = await tx.inventoryTransaction.create({
          data: {
            facilityId: existing.toFacilityId,
            inventoryItemId: it.inventoryItemId,
            batchId: destBatchId,
            transactionType: "transfer_in",
            quantity: it.quantity,
            referenceType: "stock_transfer",
            referenceId: id,
            performedById: session.user.id,
            transactionAt: new Date(),
            notes: `Transfer in: ${existing.transferNumber}`,
          },
        });

        txnResults.push({ outTxn, inTxn, sourceFi: updatedSource, destFi });
      }

      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { status: "received", receivedById: session.user.id, receivedAt: new Date() },
      });

      return { transfer: updated, txnResults };
    }).catch((err) => ({ error: err.message }));

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.toFacilityId,
      action: "STOCK_TRANSFER_COMPLETED",
      resourceType: "stock_transfer",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "received", itemCount: result.txnResults.length },
    });

    return NextResponse.json({ item: result.transfer });
  }

  // ---- CANCEL ----
  if (action === "cancel") {
    if (["received", "cancelled"].includes(existing.status)) {
      return NextResponse.json({ error: "Cannot cancel a received or already-cancelled transfer" }, { status: 400 });
    }
    const updated = await db.stockTransfer.update({
      where: { id },
      data: { status: "cancelled" },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.fromFacilityId,
      action: "STOCK_TRANSFER_CANCELLED",
      resourceType: "stock_transfer",
      resourceId: id,
      oldValues: { status: existing.status },
      newValues: { status: "cancelled" },
    });
    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
