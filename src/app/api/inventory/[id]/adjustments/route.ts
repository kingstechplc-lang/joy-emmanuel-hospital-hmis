// =====================================================================
// API: /api/inventory/[id]/adjustments
//   GET  — list stock adjustments for an item
//   POST — create a StockAdjustment record AND a signed InventoryTransaction
//          (transactionType: adjustment) that updates FacilityInventory
//          currentQuantity + (optionally) the batch quantity.
//
// POST body:
//   {
//     facilityId,            // required
//     adjustmentType,        // counting_error | damaged | lost | found |
//                            //   data_correction | expired | conversion | other
//     newQuantity,           // required: the desired post-adjustment quantity
//     batchId?,              // optional: specific batch to adjust
//     reason,                // required: short reason
//     notes?,                // optional: longer notes
//     unitCost?,             // optional: per-unit cost for valuation
//   }
//
// The endpoint is idempotent in spirit: it computes
//   beforeQuantity  = FacilityInventory.currentQuantity
//   adjustmentQuantity = newQuantity - beforeQuantity
//   afterQuantity   = newQuantity
// and refuses if newQuantity < 0.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_ADJUSTMENT_TYPES = new Set([
  "counting_error",
  "damaged",
  "lost",
  "found",
  "data_correction",
  "expired",
  "conversion",
  "other",
]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;

  const where: any = { inventoryItemId: id };
  if (facilityId) where.facilityId = facilityId;

  const adjustments = await db.stockAdjustment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      facility: { select: { id: true, name: true, code: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: adjustments, count: adjustments.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_ADJUST)) {
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

  const { facilityId, adjustmentType, newQuantity, batchId, reason, notes, unitCost } = body;

  if (!facilityId) {
    return NextResponse.json({ error: "facilityId is required" }, { status: 400 });
  }
  if (!adjustmentType || !VALID_ADJUSTMENT_TYPES.has(adjustmentType)) {
    return NextResponse.json(
      { error: `adjustmentType must be one of: ${[...VALID_ADJUSTMENT_TYPES].join(", ")}` },
      { status: 400 }
    );
  }
  if (newQuantity === undefined || newQuantity === null || Number.isNaN(Number(newQuantity))) {
    return NextResponse.json({ error: "newQuantity is required" }, { status: 400 });
  }
  if (!reason || !String(reason).trim()) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const afterQty = Math.floor(Number(newQuantity));
  if (afterQty < 0) {
    return NextResponse.json({ error: "newQuantity cannot be negative" }, { status: 400 });
  }

  // Validate item exists
  const item = await db.inventoryItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });

  // Run the adjustment inside a transaction
  const result = await db
    .$transaction(async (tx) => {
      // Find or create the FacilityInventory row
      let fi = await tx.facilityInventory.findUnique({
        where: { facilityId_inventoryItemId: { facilityId, inventoryItemId: id } },
      });
      if (!fi) {
        fi = await tx.facilityInventory.create({
          data: {
            facilityId,
            inventoryItemId: id,
            currentQuantity: 0,
            minimumQuantity: item.minimumStock || item.reorderLevel || 0,
            maximumQuantity: item.maximumStock || 0,
          },
        });
      }

      const beforeQty = Number(fi.currentQuantity) || 0;
      const adjustmentQty = afterQty - beforeQty; // signed

      // Update batch if provided
      if (batchId) {
        const batch = await tx.inventoryBatch.findUnique({ where: { id: batchId } });
        if (!batch) throw new Error("Batch not found");
        if (batch.facilityInventoryId !== fi.id) {
          throw new Error("Batch does not belong to this facility inventory");
        }
        const newBatchQty = Number(batch.quantity) + adjustmentQty;
        if (newBatchQty < 0) {
          throw new Error(
            `Batch ${batch.batchNumber} only has ${batch.quantity} units (needs ${-adjustmentQty})`
          );
        }
        await tx.inventoryBatch.update({
          where: { id: batchId },
          data: { quantity: newBatchQty },
        });
      }

      // Update the FacilityInventory current quantity
      const updatedInv = await tx.facilityInventory.update({
        where: { id: fi.id },
        data: {
          currentQuantity: afterQty,
          // Track the unit cost on the facility row if provided
          ...(unitCost !== undefined
            ? {
                lastCostPrice: Number(unitCost) || 0,
                averageCost: Number(unitCost) || fi.averageCost || 0,
              }
            : {}),
        },
      });

      // Optionally update item-level stock control fields if requested
      // (kept simple — caller can PATCH the item separately for that)

      // Compute valuation for the transaction
      const cost = unitCost !== undefined ? Number(unitCost) : Number(fi.lastCostPrice) || 0;
      const totalValue = Math.abs(adjustmentQty) * cost;

      // Create the signed InventoryTransaction (transactionType: adjustment)
      const txn = await tx.inventoryTransaction.create({
        data: {
          facilityId,
          inventoryItemId: id,
          batchId: batchId || null,
          transactionType: "adjustment",
          quantity: adjustmentQty, // signed
          balanceBefore: beforeQty,
          balanceAfter: afterQty,
          unitCost: cost,
          totalValue,
          referenceType: "stock_adjustment",
          referenceId: null, // filled in below after we know the adjustment id
          performedById: session.user.id,
          transactionAt: new Date(),
          reason: String(reason).trim(),
          notes: notes || null,
        },
      });

      // Create the StockAdjustment record (status: completed)
      const adjustment = await tx.stockAdjustment.create({
        data: {
          facilityId,
          inventoryItemId: id,
          batchId: batchId || null,
          adjustmentType,
          beforeQuantity: beforeQty,
          adjustmentQuantity: adjustmentQty,
          afterQuantity: afterQty,
          reason: String(reason).trim(),
          notes: notes || null,
          status: "completed",
          requestedById: session.user.id,
          approvedById: session.user.id, // auto-approved when performed by an adjuster
          approvedAt: new Date(),
          completedAt: new Date(),
        },
      });

      // Link the transaction back to the adjustment
      await tx.inventoryTransaction.update({
        where: { id: txn.id },
        data: { referenceId: adjustment.id },
      });

      return { adjustment, transaction: txn, inventory: updatedInv };
    })
    .catch((err) => ({ error: err.message }));

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "STOCK_ADJUSTMENT_CREATED",
    resourceType: "stock_adjustment",
    resourceId: result.adjustment.id,
    newValues: {
      inventoryItemId: id,
      adjustmentType,
      beforeQuantity: result.adjustment.beforeQuantity,
      adjustmentQuantity: result.adjustment.adjustmentQuantity,
      afterQuantity: result.adjustment.afterQuantity,
      reason,
      notes,
      batchId: batchId || null,
    },
  });

  return NextResponse.json({ ...result }, { status: 201 });
}
