// =====================================================================
// API: /api/inventory/alerts
//   GET — inventory par-level alerts + expiry tracking + stock-out impact
//
// Returns:
//   {
//     belowPar: [{ itemId, itemName, sku, currentQty, reorderLevel,
//                  safetyStock, reorderQuantity, supplierName, medicationId,
//                  activePrescriptionCount }],
//     critical: [{ ...same fields }],  // below safety stock
//     expiringSoon: [{ batchId, batchNumber, itemName, expiryDate, daysUntilExpiry, quantity }],
//     summary: { totalItems, belowParCount, criticalCount, expiringCount }
//   }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityParam = url.searchParams.get("facilityId");
  const expiryDays = parseInt(url.searchParams.get("expiryDays") || "90");
  const isSuperAdmin = session.user.roles.includes("super_admin");

  // Facility scoping
  const facilityId = isSuperAdmin
    ? (facilityParam || undefined)
    : (session.user.facilityId || facilityParam || undefined);

  try {
    // ── Fetch all facility inventory with the master item ────────
    const facilityInventory = await db.facilityInventory.findMany({
      where: facilityId ? { facilityId } : {},
      include: {
        inventoryItem: {
          select: {
            id: true,
            name: true,
            sku: true,
            itemType: true,
            category: true,
            unit: true,
            reorderLevel: true,
            minimumStock: true,
            maximumStock: true,
            reorderQuantity: true,
            safetyStock: true,
            preferredSupplierId: true,
            medicationId: true,
            status: true,
          },
        },
        facility: {
          select: { id: true, name: true, code: true },
        },
        batches: {
          where: { status: "active" },
          select: {
            id: true,
            batchNumber: true,
            expiryDate: true,
            quantity: true,
            status: true,
          },
        },
      },
    });

    // ── Build below-par + critical lists ─────────────────────────
    const belowPar: any[] = [];
    const critical: any[] = [];

    for (const fi of facilityInventory) {
      const item = fi.inventoryItem;
      if (!item || item.status !== "active") continue;

      const currentQty = fi.currentQuantity - fi.reservedQuantity;
      const reorderLevel = fi.minimumQuantity || item.reorderLevel || 0;
      const safetyStock = item.safetyStock || 0;

      // Skip if currentQty > reorderLevel (healthy stock)
      if (currentQty > reorderLevel) continue;

      const isCritical = currentQty <= safetyStock;

      // Look up supplier name if we have a preferredSupplierId
      let supplierName: string | null = null;
      if (item.preferredSupplierId) {
        const supplier = await db.supplier.findUnique({
          where: { id: item.preferredSupplierId },
          select: { name: true },
        });
        supplierName = supplier?.name || null;
      }

      // Count active prescriptions for this medication (stock-out impact)
      let activeRxCount = 0;
      if (item.medicationId) {
        activeRxCount = await db.prescriptionItem.count({
          where: {
            medicationId: item.medicationId,
            prescription: { status: { in: ["pending", "approved", "dispensed"] } },
          },
        });
      }

      const entry = {
        facilityInventoryId: fi.id,
        itemId: item.id,
        itemName: item.name,
        sku: item.sku,
        itemType: item.itemType,
        category: item.category,
        unit: item.unit,
        currentQty,
        reorderLevel,
        safetyStock,
        reorderQuantity: item.reorderQuantity || 0,
        preferredSupplierId: item.preferredSupplierId || null,
        supplierName,
        medicationId: item.medicationId || null,
        activePrescriptionCount: activeRxCount,
        facilityName: fi.facility?.name,
        facilityId: fi.facilityId,
      };

      if (isCritical) {
        critical.push(entry);
      } else {
        belowPar.push(entry);
      }
    }

    // ── Expiry tracking ──────────────────────────────────────────
    const expiryThreshold = new Date();
    expiryThreshold.setDate(expiryThreshold.getDate() + expiryDays);

    const expiringBatches = await db.inventoryBatch.findMany({
      where: {
        status: "active",
        expiryDate: { lte: expiryThreshold, gte: new Date() },
        ...(facilityId
          ? { facilityInventory: { facilityId } }
          : {}),
      },
      include: {
        facilityInventory: {
          include: {
            inventoryItem: { select: { id: true, name: true, sku: true, unit: true } },
          },
        },
      },
      orderBy: { expiryDate: "asc" },
      take: 200,
    });

    const expiringSoon = expiringBatches.map((b) => {
      const now = new Date();
      const expiry = b.expiryDate ? new Date(b.expiryDate) : null;
      const daysUntilExpiry = expiry
        ? Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return {
        batchId: b.id,
        batchNumber: b.batchNumber,
        itemId: b.facilityInventory?.inventoryItem?.id,
        itemName: b.facilityInventory?.inventoryItem?.name || "Unknown",
        sku: b.facilityInventory?.inventoryItem?.sku,
        unit: b.facilityInventory?.inventoryItem?.unit,
        expiryDate: b.expiryDate,
        daysUntilExpiry,
        quantity: b.quantity,
        severity: daysUntilExpiry !== null && daysUntilExpiry <= 30 ? "critical" : daysUntilExpiry !== null && daysUntilExpiry <= 60 ? "warning" : "info",
      };
    });

    return NextResponse.json({
      belowPar,
      critical,
      expiringSoon,
      summary: {
        totalItems: facilityInventory.length,
        belowParCount: belowPar.length,
        criticalCount: critical.length,
        expiringCount: expiringSoon.length,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/inventory/alerts] error:", e);
    return NextResponse.json(
      { error: "Failed to load inventory alerts", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
