// =====================================================================
// API: /api/inventory/[id]/transactions
//   GET  — transaction history for an item (across all facilities if no facilityId)
//   POST — create a new InventoryTransaction + auto-update facility_inventory.currentQuantity
//          (auto-creates FacilityInventory if missing)
//
// POST body:
//   { facilityId, transactionType, quantity, batchId?, reason?, notes?, minimumQuantity?, maximumQuantity?, storageLocation? }
//   transactionType: receive | issue | return | adjustment | damage | expiry | transfer_out | transfer_in | dispense
//   quantity: signed (+ for receive/return/transfer_in/adjustment-up; - for issue/damage/expiry/transfer_out)
//             OR unsigned — caller specifies direction via transactionType (we'll auto-sign based on type)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const POSITIVE_TYPES = new Set(["receive", "return", "transfer_in", "adjustment"]);
const NEGATIVE_TYPES = new Set(["issue", "damage", "expiry", "transfer_out", "dispense"]);

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

  const transactions = await db.inventoryTransaction.findMany({
    where,
    orderBy: { transactionAt: "desc" },
    take: 200,
    include: {
      facility: { select: { id: true, name: true, code: true } },
      batch: { select: { id: true, batchNumber: true, expiryDate: true } },
      performedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: transactions, count: transactions.length });
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
  const {
    facilityId,
    transactionType,
    quantity,
    batchId,
    reason,
    notes,
    referenceType,
    referenceId,
    minimumQuantity,
    maximumQuantity,
    storageLocation,
  } = body;

  if (!facilityId) return NextResponse.json({ error: "facilityId is required" }, { status: 400 });
  if (!transactionType) return NextResponse.json({ error: "transactionType is required" }, { status: 400 });
  const qty = Number(quantity);
  if (!qty || qty === 0) return NextResponse.json({ error: "quantity must be a non-zero number" }, { status: 400 });

  // Auto-sign the quantity based on type if caller gave unsigned value
  let signedQty = Math.abs(qty);
  if (NEGATIVE_TYPES.has(transactionType)) signedQty = -signedQty;
  // POSITIVE_TYPES keep positive

  // Validate item exists
  const item = await db.inventoryItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });

  // Run in transaction
  const result = await db.$transaction(async (tx) => {
    // Find or create facility inventory row
    let fi = await tx.facilityInventory.findUnique({
      where: { facilityId_inventoryItemId: { facilityId, inventoryItemId: id } },
    });
    if (!fi) {
      fi = await tx.facilityInventory.create({
        data: {
          facilityId,
          inventoryItemId: id,
          currentQuantity: 0,
          minimumQuantity: Number(minimumQuantity) || 0,
          maximumQuantity: Number(maximumQuantity) || 0,
          storageLocation: storageLocation || null,
        },
      });
    } else if (minimumQuantity !== undefined || maximumQuantity !== undefined || storageLocation !== undefined) {
      fi = await tx.facilityInventory.update({
        where: { id: fi.id },
        data: {
          minimumQuantity: minimumQuantity !== undefined ? Number(minimumQuantity) : fi.minimumQuantity,
          maximumQuantity: maximumQuantity !== undefined ? Number(maximumQuantity) : fi.maximumQuantity,
          storageLocation: storageLocation !== undefined ? storageLocation : fi.storageLocation,
        },
      });
    }

    // Validate batch if provided
    if (batchId) {
      const batch = await tx.inventoryBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw new Error("Batch not found");
      if (batch.facilityInventoryId !== fi.id) {
        throw new Error("Batch does not belong to this facility inventory");
      }
      if (signedQty < 0 && batch.quantity + signedQty < 0) {
        throw new Error(`Batch ${batch.batchNumber} only has ${batch.quantity} units (requested ${-signedQty})`);
      }
      // Update batch quantity
      await tx.inventoryBatch.update({
        where: { id: batchId },
        data: { quantity: { increment: signedQty } },
      });
    }

    // Update facility inventory current quantity
    const newQty = fi.currentQuantity + signedQty;
    if (newQty < 0) {
      throw new Error(`Insufficient stock. Current: ${fi.currentQuantity}, attempted change: ${signedQty}`);
    }
    const updatedInv = await tx.facilityInventory.update({
      where: { id: fi.id },
      data: { currentQuantity: newQty },
    });

    // Create transaction record
    const txn = await tx.inventoryTransaction.create({
      data: {
        facilityId,
        inventoryItemId: id,
        batchId: batchId || null,
        transactionType,
        quantity: signedQty,
        referenceType: referenceType || null,
        referenceId: referenceId || null,
        performedById: session.user.id,
        transactionAt: new Date(),
        notes: notes || reason || null,
      },
    });

    return { transaction: txn, inventory: updatedInv };
  }).catch((err) => ({ error: err.message }));

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "INVENTORY_ADJUSTED",
    resourceType: "inventory_transaction",
    resourceId: result.transaction.id,
    newValues: {
      inventoryItemId: id,
      transactionType,
      quantity: signedQty,
      batchId: batchId || null,
      notes,
      reason,
    },
  });

  return NextResponse.json({ ...result }, { status: 201 });
}
