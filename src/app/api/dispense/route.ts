// =====================================================================
// API: /api/dispense
//   POST — dispense a prescription item (TRANSACTIONAL)
//
// Body: { prescriptionItemId, batchId, quantity, createInvoice?: boolean }
//
// Effects (atomic via db.$transaction):
//   1. Verify batch has enough quantity
//   2. Decrement batch.quantity
//   3. Decrement facility_inventory.currentQuantity
//   4. Update prescription_item.dispensedQuantity += quantity
//   5. Update prescription_item.status (dispensed if qty == dispensedQty else partially_dispensed)
//   6. Update prescription.status (dispensed if all items dispensed)
//   7. Create InventoryTransaction (type=dispense, quantity=-qty)
//   8. Audit log: PRESCRIPTION_DISPENSED
//   9. Optionally create an invoice + invoice item if createInvoice=true
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission, nextInvoiceNumber } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PHARMACY_DISPENSE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { prescriptionItemId, batchId, quantity, createInvoice } = body;

  if (!prescriptionItemId) return NextResponse.json({ error: "prescriptionItemId is required" }, { status: 400 });
  if (!batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });
  const qty = Number(quantity);
  if (!qty || qty <= 0) return NextResponse.json({ error: "quantity must be a positive number" }, { status: 400 });

  // Run atomically
  const result = await db.$transaction(async (tx) => {
    // 1. Load the prescription item with relations
    const item = await tx.prescriptionItem.findUnique({
      where: { id: prescriptionItemId },
      include: {
        prescription: {
          include: {
            patient: true,
            facility: true,
          },
        },
        medication: true,
      },
    });
    if (!item) throw new Error("Prescription item not found");

    if (item.status === "dispensed") throw new Error("Item already fully dispensed");
    if (item.status === "cancelled") throw new Error("Cannot dispense a cancelled item");

    const remaining = item.quantity - item.dispensedQuantity;
    if (qty > remaining) {
      throw new Error(`Cannot dispense ${qty} units. Only ${remaining} remaining for this item.`);
    }

    // 2. Load + verify batch
    const batch = await tx.inventoryBatch.findUnique({
      where: { id: batchId },
      include: { facilityInventory: true },
    });
    if (!batch) throw new Error("Batch not found");

    if (batch.quantity < qty) {
      throw new Error(`Batch ${batch.batchNumber} only has ${batch.quantity} units available (requested ${qty}).`);
    }

    if (batch.expiryDate && new Date(batch.expiryDate) < new Date()) {
      throw new Error(`Batch ${batch.batchNumber} has expired.`);
    }

    const facilityId = item.prescription.facilityId;

    // 3. Verify batch belongs to the same facility inventory item
    // The facilityInventory must be at this facility
    if (batch.facilityInventory.facilityId !== facilityId) {
      throw new Error("Batch is not at the same facility as the prescription");
    }

    // 4. Decrement batch.quantity
    const updatedBatch = await tx.inventoryBatch.update({
      where: { id: batchId },
      data: { quantity: { decrement: qty } },
    });

    // 5. Decrement facility_inventory.currentQuantity
    const updatedInv = await tx.facilityInventory.update({
      where: { id: batch.facilityInventoryId },
      data: { currentQuantity: { decrement: qty } },
    });

    // 6. Update prescription_item.dispensedQuantity + status
    const newDispensedQty = item.dispensedQuantity + qty;
    const newStatus = newDispensedQty >= item.quantity ? "dispensed" : "partially_dispensed";

    const updatedItem = await tx.prescriptionItem.update({
      where: { id: prescriptionItemId },
      data: {
        dispensedQuantity: newDispensedQty,
        status: newStatus,
      },
    });

    // 7. Update prescription.status if all items dispensed
    const allItems = await tx.prescriptionItem.findMany({
      where: { prescriptionId: item.prescriptionId },
      select: { id: true, status: true },
    });
    const allDispensed = allItems.length > 0 && allItems.every((i) => i.status === "dispensed" || i.id === prescriptionItemId && newStatus === "dispensed");
    const anyDispensed = allItems.some((i) => i.status === "dispensed" || i.status === "partially_dispensed" || i.id === prescriptionItemId);
    let newRxStatus = item.prescription.status;
    if (allDispensed) {
      newRxStatus = "dispensed";
      await tx.prescription.update({
        where: { id: item.prescriptionId },
        data: { status: "dispensed" },
      });
    } else if (anyDispensed && item.prescription.status !== "partially_dispensed") {
      newRxStatus = "partially_dispensed";
      await tx.prescription.update({
        where: { id: item.prescriptionId },
        data: { status: "partially_dispensed" },
      });
    }

    // 8. Create InventoryTransaction (negative = dispense)
    const txn = await tx.inventoryTransaction.create({
      data: {
        facilityId,
        inventoryItemId: batch.facilityInventory.inventoryItemId,
        batchId,
        transactionType: "dispense",
        quantity: -qty,
        referenceType: "prescription",
        referenceId: item.prescriptionId,
        performedById: session.user.id,
        transactionAt: new Date(),
        notes: `Dispensed for Rx ${item.prescription.prescriptionNumber} — ${item.medication.genericName} ${item.dose || ""}`,
      },
    });

    // 9. Optionally create invoice + line item
    let invoice: Awaited<ReturnType<typeof tx.invoice.create>> | null = null;
    if (createInvoice) {
      // Try to find an existing open invoice for this patient at this facility
      const existingInvoice = await tx.invoice.findFirst({
        where: {
          patientId: item.prescription.patientId,
          facilityId,
          status: { in: ["draft", "issued", "partially_paid"] },
        },
        orderBy: { createdAt: "desc" },
      });

      const unitPrice = batch.sellingPrice || 0;
      const lineTotal = unitPrice * qty;

      if (existingInvoice) {
        const lineItem = await tx.invoiceItem.create({
          data: {
            invoiceId: existingInvoice.id,
            description: `Pharmacy: ${item.medication.genericName}${item.medication.brandName ? ` (${item.medication.brandName})` : ""} ${item.medication.strength || ""} x${qty}`,
            quantity: qty,
            unitPrice,
            total: lineTotal,
            referenceType: "prescription",
            referenceId: item.prescriptionId,
          },
        });
        // Recompute invoice totals
        const allItems = await tx.invoiceItem.findMany({ where: { invoiceId: existingInvoice.id } });
        const newSubtotal = allItems.reduce((s, i) => s + (i.total || 0), 0);
        const newTotal = newSubtotal - (existingInvoice.discount || 0) + (existingInvoice.tax || 0);
        const newBalance = newTotal - (existingInvoice.amountPaid || 0);
        const newStatus = newBalance <= 0.0001 ? "paid" : (existingInvoice.amountPaid > 0 ? "partially_paid" : existingInvoice.status);
        invoice = await tx.invoice.update({
          where: { id: existingInvoice.id },
          data: {
            subtotal: newSubtotal,
            total: newTotal,
            balance: newBalance,
            status: newStatus,
          },
        });
      } else {
        const invoiceNumber = await nextInvoiceNumber(facilityId);
        invoice = await tx.invoice.create({
          data: {
            patientId: item.prescription.patientId,
            encounterId: item.prescription.encounterId,
            facilityId,
            invoiceNumber,
            status: "issued",
            subtotal: lineTotal,
            total: lineTotal,
            balance: lineTotal,
            currency: "GHS",
            issuedAt: new Date(),
            dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            createdById: session.user.id,
            items: {
              create: {
                description: `Pharmacy: ${item.medication.genericName}${item.medication.brandName ? ` (${item.medication.brandName})` : ""} ${item.medication.strength || ""} x${qty}`,
                quantity: qty,
                unitPrice,
                total: lineTotal,
                referenceType: "prescription",
                referenceId: item.prescriptionId,
              },
            },
          },
        });
      }
    }

    return {
      item: updatedItem,
      batch: updatedBatch,
      inventory: updatedInv,
      transaction: txn,
      prescriptionStatus: newRxStatus,
      invoice,
    };
  }).catch((err) => {
    return { error: err.message };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Audit log (outside transaction — best-effort)
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: result.transaction.facilityId,
    action: "PRESCRIPTION_DISPENSED",
    resourceType: "prescription",
    resourceId: result.item.prescriptionId,
    newValues: {
      prescriptionItemId: result.item.id,
      batchId,
      quantity: qty,
      newDispensedQuantity: result.item.dispensedQuantity,
      itemStatus: result.item.status,
      prescriptionStatus: result.prescriptionStatus,
      invoiceId: result.invoice?.id || null,
    },
  });

  return NextResponse.json({ ...result }, { status: 201 });
}
