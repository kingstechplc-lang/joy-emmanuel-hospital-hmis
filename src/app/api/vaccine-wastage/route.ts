// =====================================================================
// API: /api/vaccine-wastage
//   GET  — list wastage records
//   POST — record a wastage event (also deducts from inventory)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMMUNIZATION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  if (!facilityId) {
    return NextResponse.json({ items: [], count: 0 });
  }

  const wastage = await db.vaccineWastage.findMany({
    where: { facilityId },
    orderBy: { disposedAt: "desc" },
    take: limit,
    include: {
      disposedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: wastage, count: wastage.length });
}

// POST /api/vaccine-wastage
// Body: { inventoryItemId?, batchId?, vaccineName, batchNumber?, quantity, reason, notes? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMMUNIZATION_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { inventoryItemId, batchId, vaccineName, batchNumber, quantity, reason, notes, facilityId: bodyFacilityId } = body;

  if (!vaccineName || !quantity || !reason) {
    return NextResponse.json(
      { error: "vaccineName, quantity, and reason are required" },
      { status: 400 }
    );
  }

  const facilityId = bodyFacilityId || session.user.facilityId;
  if (!facilityId) {
    return NextResponse.json({ error: "facilityId is required" }, { status: 400 });
  }

  // Create the wastage record + deduct from inventory in a transaction
  const result = await db.$transaction(async (tx) => {
    const wastage = await tx.vaccineWastage.create({
      data: {
        organizationId: session.user.organizationId,
        facilityId,
        inventoryItemId: inventoryItemId || null,
        batchId: batchId || null,
        vaccineName,
        batchNumber: batchNumber || null,
        quantity: Number(quantity),
        reason,
        notes: notes || null,
        disposedById: session.user.id,
      },
    });

    // Deduct from the batch if linked
    if (batchId) {
      const batch = await tx.inventoryBatch.findUnique({
        where: { id: batchId },
        include: { facilityInventory: { select: { id: true, facilityId: true, inventoryItemId: true } } },
      });
      if (batch && batch.facilityInventory.facilityId === facilityId) {
        const newQty = Math.max(0, batch.quantity - Number(quantity));
        await tx.inventoryBatch.update({
          where: { id: batchId },
          data: { quantity: newQty },
        });
        await tx.facilityInventory.update({
          where: { id: batch.facilityInventory.id },
          data: { currentQuantity: { decrement: Number(quantity) } },
        });
        // Create inventory transaction
        await tx.inventoryTransaction.create({
          data: {
            facilityId,
            inventoryItemId: batch.facilityInventory.inventoryItemId,
            batchId,
            transactionType: "damage", // vaccine wastage = damage
            quantity: -Number(quantity),
            referenceType: "vaccine_wastage",
            referenceId: wastage.id,
            performedById: session.user.id,
            transactionAt: new Date(),
            notes: `Vaccine wastage: ${reason} — ${vaccineName} (${quantity} doses)`,
          },
        });
      }
    }

    return wastage;
  }).catch((err) => ({ error: err.message }));

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "VACCINE_WASTAGE_RECORDED",
    resourceType: "vaccineWastage",
    resourceId: result.id,
    newValues: { vaccineName, batchNumber, quantity, reason },
  });

  return NextResponse.json({ item: result }, { status: 201 });
}
