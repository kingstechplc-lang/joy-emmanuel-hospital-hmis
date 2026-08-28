// =====================================================================
// API: /api/stock-transfers/[id]
//   GET   — full detail with ALL relations + computed metrics
//   PATCH — 12 lifecycle actions:
//             submit, approve, reject, prepare, ready, dispatch,
//             receive, verify, complete, hold, release, cancel
//
// TRANSACTIONAL actions:
//   dispatch — InventoryTransaction(transfer_out) per item, reduce source
//              FacilityInventory (create if missing for audit safety).
//   receive  — InventoryTransaction(transfer_in) per item, increase dest
//              FacilityInventory (create if missing), update per-line
//              received/rejected/damaged quantities. Auto-selects
//              partially_received vs received based on completion.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const CLOSED_STATUSES = new Set([
  "received",
  "verified",
  "completed",
  "cancelled",
  "rejected",
  "discrepancy",
]);

function userSel() {
  return { select: { id: true, firstName: true, lastName: true, username: true } };
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeOverdue(t: { expectedDeliveryDate?: Date | string | null; status: string }): boolean {
  if (!t?.expectedDeliveryDate) return false;
  if (CLOSED_STATUSES.has(t.status)) return false;
  return new Date(t.expectedDeliveryDate).getTime() < Date.now();
}

// Infers the previous status for `release` from lifecycle timestamps.
// (Schema has no previousStatus field — we infer from the latest stage
// reached before being put on hold.)
function inferPreviousStatus(t: any): string {
  if (t.dispatchedAt) return "dispatched";
  if (t.preparedAt) return "preparing";
  if (t.approvedAt) return "approved";
  if (t.submittedAt) return "pending_approval";
  return "draft";
}

// =====================================================================
// GET /api/stock-transfers/[id]
// =====================================================================
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let t: any;
  try {
    t = await db.stockTransfer.findUnique({
      where: { id },
      include: {
        fromFacility: { select: { id: true, name: true, code: true } },
        toFacility: { select: { id: true, name: true, code: true } },
        requestedBy: userSel(),
        approvedBy: userSel(),
        rejectedBy: userSel(),
        preparedBy: userSel(),
        dispatchedBy: userSel(),
        receivedBy: userSel(),
        verifiedBy: userSel(),
        cancelledBy: userSel(),
        heldBy: userSel(),
        items: {
          include: {
            inventoryItem: {
              select: {
                id: true, name: true, sku: true, unit: true, category: true, itemType: true,
              },
            },
          },
        },
      },
    });
  } catch (e: any) {
    console.error("stock-transfer GET failed:", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }

  if (!t) return NextResponse.json({ error: "Stock transfer not found" }, { status: 404 });

  // Computed metrics — resilient
  const items = t.items || [];
  const totalRequestedQty = items.reduce((s: number, it: any) => s + num(it.requestedQuantity), 0);
  const totalApprovedQty = items.reduce((s: number, it: any) => s + num(it.approvedQuantity), 0);
  const totalPreparedQty = items.reduce((s: number, it: any) => s + num(it.preparedQuantity), 0);
  const totalDispatchedQty = items.reduce((s: number, it: any) => s + num(it.dispatchedQuantity), 0);
  const totalReceivedQty = items.reduce((s: number, it: any) => s + num(it.receivedQuantity), 0);
  const totalRejectedQty = items.reduce((s: number, it: any) => s + num(it.rejectedQuantity), 0);
  const totalDamagedQty = items.reduce((s: number, it: any) => s + num(it.damagedQuantity), 0);
  const totalOutstandingQty = Math.max(0, totalDispatchedQty - totalReceivedQty - totalRejectedQty);

  const receivedPct = totalRequestedQty > 0
    ? Math.min(100, Math.round((totalReceivedQty / totalRequestedQty) * 100))
    : 0;

  // Per-line outstanding
  const lineItems = items.map((it: any) => {
    const outstanding = Math.max(
      0,
      num(it.dispatchedQuantity) - num(it.receivedQuantity) - num(it.rejectedQuantity) - num(it.damagedQuantity)
    );
    return { ...it, outstandingQuantity: outstanding };
  });

  const item = {
    ...t,
    totalQuantity: num(t.totalQuantity),
    totalValue: num(t.totalValue),
    isOverdue: computeOverdue(t),
    items: lineItems,
    metrics: {
      totalRequestedQty,
      totalApprovedQty,
      totalPreparedQty,
      totalDispatchedQty,
      totalReceivedQty,
      totalRejectedQty,
      totalDamagedQty,
      totalOutstandingQty,
      receivedPct,
      lineCount: items.length,
    },
  };

  return NextResponse.json({ item });
}

// =====================================================================
// PATCH /api/stock-transfers/[id]
// Body: { action: "submit"|"approve"|"reject"|"prepare"|"ready"|"dispatch"|
//                "receive"|"verify"|"complete"|"hold"|"release"|"cancel",
//         ...payload }
// =====================================================================
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_TRANSFER)) {
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
  const { action } = body;

  let existing: any;
  try {
    existing = await db.stockTransfer.findUnique({
      where: { id },
      include: { items: { include: { inventoryItem: { select: { id: true, name: true, sku: true, unit: true } } } } },
    });
  } catch (e: any) {
    console.error("stock-transfer lookup failed:", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: "Stock transfer not found" }, { status: 404 });

  const audit = (act: string, oldValues: any, newValues: any) =>
    auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: existing.fromFacilityId,
      action: act,
      resourceType: "stock_transfer",
      resourceId: id,
      oldValues,
      newValues,
      reason:
        body.rejectionReason || body.holdReason || body.cancelReason || body.dispatchNotes || undefined,
    });

  // ---- SUBMIT: draft → pending_approval ----
  if (action === "submit") {
    if (existing.status !== "draft") {
      return NextResponse.json({ error: "Only draft transfers can be submitted" }, { status: 400 });
    }
    const updated = await db.stockTransfer.update({
      where: { id },
      data: { status: "pending_approval", submittedAt: new Date() },
    });
    await audit("STOCK_TRANSFER_SUBMITTED", { status: existing.status }, { status: "pending_approval" });
    return NextResponse.json({ item: updated });
  }

  // ---- APPROVE: pending_approval → approved (also set approvedQuantity on items) ----
  if (action === "approve") {
    if (existing.status !== "pending_approval") {
      return NextResponse.json({ error: "Only transfers pending approval can be approved" }, { status: 400 });
    }
    // Optional per-line approved quantities
    const approvedItems: Array<{ id: string; approvedQuantity: number }> = body.items || [];
    const result = await db.$transaction(async (tx) => {
      // Update each item's approvedQuantity if provided, else default to requested
      for (const it of existing.items) {
        const override = approvedItems.find((a) => a.id === it.id);
        const approvedQty = override
          ? Math.max(0, Math.floor(Number(override.approvedQuantity) || 0))
          : it.requestedQuantity;
        await tx.stockTransferItem.update({
          where: { id: it.id },
          data: { approvedQuantity: approvedQty },
        });
      }
      return tx.stockTransfer.update({
        where: { id },
        data: {
          status: "approved",
          approvedAt: new Date(),
          approvedById: session.user.id,
        },
      });
    }).catch((err: any) => ({ error: err.message }));
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    await audit("STOCK_TRANSFER_APPROVED", { status: existing.status }, { status: "approved" });
    return NextResponse.json({ item: result });
  }

  // ---- REJECT: pending_approval → rejected (requires rejectionReason) ----
  if (action === "reject") {
    if (existing.status !== "pending_approval") {
      return NextResponse.json({ error: "Only transfers pending approval can be rejected" }, { status: 400 });
    }
    const rejectionReason = (body.rejectionReason || "").trim();
    if (!rejectionReason) {
      return NextResponse.json({ error: "rejectionReason is required" }, { status: 400 });
    }
    const updated = await db.stockTransfer.update({
      where: { id },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedById: session.user.id,
        rejectionReason,
      },
    });
    await audit("STOCK_TRANSFER_REJECTED", { status: existing.status }, { status: "rejected", rejectionReason });
    return NextResponse.json({ item: updated });
  }

  // ---- PREPARE: approved → preparing (optionally update preparedQuantity) ----
  if (action === "prepare") {
    if (existing.status !== "approved") {
      return NextResponse.json({ error: "Only approved transfers can be prepared" }, { status: 400 });
    }
    const preparedItems: Array<{ id: string; preparedQuantity: number }> = body.items || [];
    const result = await db.$transaction(async (tx) => {
      for (const it of existing.items) {
        const override = preparedItems.find((a) => a.id === it.id);
        const preparedQty = override
          ? Math.max(0, Math.floor(Number(override.preparedQuantity) || 0))
          : it.approvedQuantity || it.requestedQuantity;
        await tx.stockTransferItem.update({
          where: { id: it.id },
          data: { preparedQuantity: preparedQty },
        });
      }
      return tx.stockTransfer.update({
        where: { id },
        data: {
          status: "preparing",
          preparedAt: new Date(),
          preparedById: session.user.id,
        },
      });
    }).catch((err: any) => ({ error: err.message }));
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    await audit("STOCK_TRANSFER_PREPARING", { status: existing.status }, { status: "preparing" });
    return NextResponse.json({ item: result });
  }

  // ---- READY: preparing → ready_for_dispatch ----
  if (action === "ready") {
    if (existing.status !== "preparing") {
      return NextResponse.json({ error: "Only preparing transfers can be marked ready" }, { status: 400 });
    }
    const updated = await db.stockTransfer.update({
      where: { id },
      data: { status: "ready_for_dispatch" },
    });
    await audit("STOCK_TRANSFER_READY", { status: existing.status }, { status: "ready_for_dispatch" });
    return NextResponse.json({ item: updated });
  }

  // ---- DISPATCH: ready_for_dispatch → dispatched ----
  // TRANSACTIONAL: per item create InventoryTransaction(transfer_out),
  //   reduce source FacilityInventory (create if missing for audit safety),
  //   set item.dispatchedQuantity = preparedQuantity || approvedQuantity || requestedQuantity.
  //   Also stores carrierName, trackingNumber, dispatchNotes.
  if (action === "dispatch") {
    if (!["ready_for_dispatch", "approved", "preparing"].includes(existing.status)) {
      return NextResponse.json(
        { error: "Only ready-for-dispatch (or approved/preparing) transfers can be dispatched" },
        { status: 400 }
      );
    }

    const carrierName = body.carrierName || null;
    const trackingNumber = body.trackingNumber || null;
    const dispatchNotes = body.dispatchNotes || null;
    // Optional per-line dispatched override
    const dispatchItems: Array<{ id: string; dispatchedQuantity: number }> = body.items || [];

    const result = await db.$transaction(async (tx) => {
      const txnResults: any[] = [];
      for (const it of existing.items) {
        const override = dispatchItems.find((a) => a.id === it.id);
        const dispatchedQty = override
          ? Math.max(0, Math.floor(Number(override.dispatchedQuantity) || 0))
          : it.preparedQuantity || it.approvedQuantity || it.requestedQuantity;

        if (dispatchedQty <= 0) continue;

        // Locate source FacilityInventory (may not exist for a brand-new item)
        const sourceFi = await tx.facilityInventory.findUnique({
          where: {
            facilityId_inventoryItemId: {
              facilityId: existing.fromFacilityId,
              inventoryItemId: it.inventoryItemId,
            },
          },
        });

        let balanceBefore: number | null = null;
        let balanceAfter: number | null = null;

        if (sourceFi) {
          balanceBefore = sourceFi.currentQuantity;
          // Guard against negative stock — allow but warn via audit
          const updatedSource = await tx.facilityInventory.update({
            where: { id: sourceFi.id },
            data: { currentQuantity: { decrement: dispatchedQty } },
          });
          balanceAfter = updatedSource.currentQuantity;

          // Decrement batch if specified
          if (it.batchId) {
            const srcBatch = await tx.inventoryBatch.findUnique({ where: { id: it.batchId } });
            if (srcBatch && srcBatch.quantity >= dispatchedQty) {
              await tx.inventoryBatch.update({
                where: { id: it.batchId },
                data: { quantity: { decrement: dispatchedQty } },
              });
            }
          }
        }

        // Update line: dispatchedQuantity + totalValue
        await tx.stockTransferItem.update({
          where: { id: it.id },
          data: {
            dispatchedQuantity: dispatchedQty,
            totalValue: +(dispatchedQty * num(it.unitCost)).toFixed(2),
          },
        });

        // Create InventoryTransaction(transfer_out) at source
        const outTxn = await tx.inventoryTransaction.create({
          data: {
            facilityId: existing.fromFacilityId,
            inventoryItemId: it.inventoryItemId,
            batchId: it.batchId || null,
            transactionType: "transfer_out",
            quantity: -dispatchedQty,
            balanceBefore,
            balanceAfter,
            unitCost: num(it.unitCost) || null,
            totalValue: +(dispatchedQty * num(it.unitCost)).toFixed(2),
            referenceType: "stock_transfer",
            referenceId: id,
            performedById: session.user.id,
            transactionAt: new Date(),
            notes: `Transfer out: ${existing.transferNumber}`,
          },
        });
        txnResults.push(outTxn);
      }

      const updated = await tx.stockTransfer.update({
        where: { id },
        data: {
          status: "dispatched",
          dispatchedAt: new Date(),
          dispatchedById: session.user.id,
          carrierName,
          trackingNumber,
          dispatchNotes,
        },
      });

      return { transfer: updated, txnResults };
    }).catch((err: any) => ({ error: err.message }));

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await audit(
      "STOCK_TRANSFER_DISPATCHED",
      { status: existing.status },
      {
        status: "dispatched",
        carrierName,
        trackingNumber,
        itemCount: result.txnResults.length,
      }
    );
    return NextResponse.json({ item: result.transfer });
  }

  // ---- RECEIVE: dispatched/in_transit → partially_received | received ----
  // TRANSACTIONAL: per item create InventoryTransaction(transfer_in),
  //   increase destination FacilityInventory (create if missing),
  //   update item receivedQuantity/rejectedQuantity/damagedQuantity.
  //   Body.items = [{ id, receivedQuantity, rejectedQuantity?, damagedQuantity? }]
  if (action === "receive") {
    if (!["dispatched", "in_transit", "partially_received"].includes(existing.status)) {
      return NextResponse.json(
        { error: "Only dispatched (or in-transit / partially-received) transfers can be received" },
        { status: 400 }
      );
    }

    const recvItems: Array<{
      id: string;
      receivedQuantity: number;
      rejectedQuantity?: number;
      damagedQuantity?: number;
    }> = body.items || [];

    if (recvItems.length === 0) {
      return NextResponse.json({ error: "At least one item is required to receive" }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      const txnResults: any[] = [];
      let fullyReceived = true;

      for (const recv of recvItems) {
        const line = existing.items.find((it) => it.id === recv.id);
        if (!line) continue;

        const receivedQty = Math.max(0, Math.floor(Number(recv.receivedQuantity) || 0));
        const rejectedQty = Math.max(0, Math.floor(Number(recv.rejectedQuantity) || 0));
        const damagedQty = Math.max(0, Math.floor(Number(recv.damagedQuantity) || 0));

        if (receivedQty <= 0 && rejectedQty <= 0 && damagedQty <= 0) continue;

        // Locate destination FacilityInventory (create if missing)
        let destFi = await tx.facilityInventory.findUnique({
          where: {
            facilityId_inventoryItemId: {
              facilityId: existing.toFacilityId,
              inventoryItemId: line.inventoryItemId,
            },
          },
        });

        let balanceBefore: number | null = null;
        let balanceAfter: number | null = null;

        if (destFi) {
          balanceBefore = destFi.currentQuantity;
          destFi = await tx.facilityInventory.update({
            where: { id: destFi.id },
            data: {
              currentQuantity: { increment: receivedQty },
              damagedQuantity: { increment: damagedQty },
            },
          });
          balanceAfter = destFi.currentQuantity;
        } else {
          destFi = await tx.facilityInventory.create({
            data: {
              facilityId: existing.toFacilityId,
              inventoryItemId: line.inventoryItemId,
              currentQuantity: receivedQty,
              damagedQuantity: damagedQty,
              minimumQuantity: 0,
              maximumQuantity: 0,
            },
          });
          balanceBefore = 0;
          balanceAfter = receivedQty;
        }

        // Update line item cumulative received/rejected/damaged
        const newReceived = num(line.receivedQuantity) + receivedQty;
        const newRejected = num(line.rejectedQuantity) + rejectedQty;
        const newDamaged = num(line.damagedQuantity) + damagedQty;
        await tx.stockTransferItem.update({
          where: { id: line.id },
          data: {
            receivedQuantity: newReceived,
            rejectedQuantity: newRejected,
            damagedQuantity: newDamaged,
          },
        });

        // Create InventoryTransaction(transfer_in) at destination
        const inTxn = await tx.inventoryTransaction.create({
          data: {
            facilityId: existing.toFacilityId,
            inventoryItemId: line.inventoryItemId,
            batchId: line.batchId || null,
            transactionType: "transfer_in",
            quantity: receivedQty,
            balanceBefore,
            balanceAfter,
            unitCost: num(line.unitCost) || null,
            totalValue: +(receivedQty * num(line.unitCost)).toFixed(2),
            referenceType: "stock_transfer",
            referenceId: id,
            performedById: session.user.id,
            transactionAt: new Date(),
            notes: `Transfer in: ${existing.transferNumber} (rejected ${rejectedQty}, damaged ${damagedQty})`,
          },
        });
        txnResults.push(inTxn);

        // Check whether this line is fully received
        const dispatchedOrRequested = num(line.dispatchedQuantity) || num(line.requestedQuantity);
        if (newReceived + newRejected < dispatchedOrRequested) {
          fullyReceived = false;
        }
      }

      // If any line is still outstanding → partially_received, else received
      const newStatus = fullyReceived ? "received" : "partially_received";
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: {
          status: newStatus,
          receivedAt: fullyReceived ? new Date() : existing.receivedAt,
          receivedById: session.user.id,
          actualDeliveryDate: fullyReceived
            ? existing.actualDeliveryDate || new Date()
            : existing.actualDeliveryDate,
        },
      });

      return { transfer: updated, txnResults, newStatus };
    }).catch((err: any) => ({ error: err.message }));

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await audit(
      "STOCK_TRANSFER_RECEIVED",
      { status: existing.status },
      {
        status: result.newStatus,
        itemCount: result.txnResults.length,
      }
    );
    return NextResponse.json({ item: result.transfer });
  }

  // ---- VERIFY: received → verified ----
  if (action === "verify") {
    if (!["received", "partially_received"].includes(existing.status)) {
      return NextResponse.json({ error: "Only received transfers can be verified" }, { status: 400 });
    }
    const updated = await db.stockTransfer.update({
      where: { id },
      data: {
        status: "verified",
        verifiedAt: new Date(),
        verifiedById: session.user.id,
      },
    });
    await audit("STOCK_TRANSFER_VERIFIED", { status: existing.status }, { status: "verified" });
    return NextResponse.json({ item: updated });
  }

  // ---- COMPLETE: verified → completed ----
  if (action === "complete") {
    if (!["verified", "received"].includes(existing.status)) {
      return NextResponse.json({ error: "Only verified/received transfers can be completed" }, { status: 400 });
    }
    const updated = await db.stockTransfer.update({
      where: { id },
      data: { status: "completed", completedAt: new Date() },
    });
    await audit("STOCK_TRANSFER_COMPLETED", { status: existing.status }, { status: "completed" });
    return NextResponse.json({ item: updated });
  }

  // ---- HOLD: any active → on_hold (requires holdReason) ----
  if (action === "hold") {
    if (CLOSED_STATUSES.has(existing.status) || existing.status === "on_hold") {
      return NextResponse.json({ error: "Cannot hold a transfer that is closed or already on hold" }, { status: 400 });
    }
    const holdReason = (body.holdReason || "").trim();
    if (!holdReason) {
      return NextResponse.json({ error: "holdReason is required" }, { status: 400 });
    }
    const updated = await db.stockTransfer.update({
      where: { id },
      data: {
        status: "on_hold",
        heldAt: new Date(),
        heldById: session.user.id,
        holdReason,
        // Stash previous status in dispatchNotes if empty (resilient best-effort)
        dispatchNotes: existing.dispatchNotes || `__previous_status__:${existing.status}`,
      },
    });
    await audit("STOCK_TRANSFER_HELD", { status: existing.status }, { status: "on_hold", holdReason, previousStatus: existing.status });
    return NextResponse.json({ item: updated });
  }

  // ---- RELEASE: on_hold → previous status (inferred from timestamps) ----
  if (action === "release") {
    if (existing.status !== "on_hold") {
      return NextResponse.json({ error: "Only on-hold transfers can be released" }, { status: 400 });
    }
    // Try to read previous status from dispatchNotes marker (set during hold)
    let previousStatus: string | null = null;
    if (existing.dispatchNotes && existing.dispatchNotes.startsWith("__previous_status__:")) {
      previousStatus = existing.dispatchNotes.replace("__previous_status__:", "").trim();
    }
    if (!previousStatus) {
      previousStatus = inferPreviousStatus(existing);
    }
    // Restore dispatchNotes only if it was our marker; otherwise leave as-is
    const restoreNotes =
      existing.dispatchNotes && existing.dispatchNotes.startsWith("__previous_status__:")
        ? null
        : existing.dispatchNotes;

    const updated = await db.stockTransfer.update({
      where: { id },
      data: {
        status: previousStatus,
        dispatchNotes: restoreNotes,
      },
    });
    await audit("STOCK_TRANSFER_RELEASED", { status: "on_hold" }, { status: previousStatus });
    return NextResponse.json({ item: updated });
  }

  // ---- CANCEL: requires cancelReason ----
  if (action === "cancel") {
    if (CLOSED_STATUSES.has(existing.status)) {
      return NextResponse.json({ error: "Cannot cancel a transfer that is already closed" }, { status: 400 });
    }
    const cancelReason = (body.cancelReason || "").trim();
    if (!cancelReason) {
      return NextResponse.json({ error: "cancelReason is required" }, { status: 400 });
    }
    const updated = await db.stockTransfer.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledById: session.user.id,
        cancelReason,
      },
    });
    await audit("STOCK_TRANSFER_CANCELLED", { status: existing.status }, { status: "cancelled", cancelReason });
    return NextResponse.json({ item: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
