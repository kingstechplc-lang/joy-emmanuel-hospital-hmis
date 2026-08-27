// =====================================================================
// API: /api/inventory/export
//   GET — export inventory items as CSV with stock levels per facility.
//
//   Columns: Name, SKU, Barcode, Type, Category, Unit, Current Qty,
//            Min Qty, Max Qty, Reorder Level, Status, Facility,
//            Storage Location, Last Cost, Stock Value
//
//   Query params:
//     facilityId — scope to one facility (defaults to session facility)
//     type       — filter by itemType (medication|consumable|equipment|supply|other)
//     category   — filter by category
//     lowStockOnly=true — only rows that are low or out of stock
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

function csvEscape(value: any): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const type = url.searchParams.get("type") || undefined;
  const category = url.searchParams.get("category") || undefined;
  const lowStockOnly = url.searchParams.get("lowStockOnly") === "true";

  const where: any = { organizationId: session.user.organizationId };
  if (type && type !== "all") where.itemType = type;
  if (category && category !== "all") where.category = category;

  const items = await db.inventoryItem.findMany({
    where,
    orderBy: { name: "asc" },
    take: 2000,
    include: {
      facilityInventory: facilityId
        ? { where: { facilityId } }
        : { include: { facility: { select: { name: true, code: true } } } },
    },
  });

  // Build rows — one row per (item × facility inventory). Items with no
  // facility inventory row still emit one row with zero quantities.
  const rows: any[] = [];
  for (const it of items as any[]) {
    const fiList = it.facilityInventory || [];
    if (fiList.length === 0) {
      // Items with no facility inventory row are always "out of stock".
      // lowStockOnly=true includes out-of-stock items, so we keep this row.
      rows.push({
        name: it.name,
        sku: it.sku,
        barcode: it.barcode || "",
        itemType: it.itemType,
        category: it.category || "",
        unit: it.unit || "",
        currentQuantity: 0,
        minimumQuantity: it.minimumStock || it.reorderLevel || 0,
        maximumQuantity: it.maximumStock || 0,
        reorderLevel: it.reorderLevel || 0,
        status: "out_of_stock",
        facilityName: facilityId ? "" : "(no stock)",
        storageLocation: "",
        lastCostPrice: "0.00",
        stockValue: "0.00",
      });
      continue;
    }
    for (const fi of fiList) {
      const currentQty = Number(fi.currentQuantity) || 0;
      const minQty = Number(fi.minimumQuantity) || it.minimumStock || it.reorderLevel || 0;
      const maxQty = Number(fi.maximumQuantity) || it.maximumStock || 0;
      const lastCost = Number(fi.lastCostPrice) || 0;
      let status = "in_stock";
      if (currentQty <= 0) status = "out_of_stock";
      else if (minQty > 0 && currentQty <= minQty) status = "low_stock";
      if (lowStockOnly && status === "in_stock") continue;

      const facName = fi.facility
        ? `${fi.facility.name}${fi.facility.code ? ` (${fi.facility.code})` : ""}`
        : facilityId
          ? ""
          : "(unknown facility)";

      rows.push({
        name: it.name,
        sku: it.sku,
        barcode: it.barcode || "",
        itemType: it.itemType,
        category: it.category || "",
        unit: it.unit || "",
        currentQuantity: currentQty,
        minimumQuantity: minQty,
        maximumQuantity: maxQty,
        reorderLevel: it.reorderLevel || 0,
        status,
        facilityName: facName,
        storageLocation: fi.storageLocation || fi.storeName || fi.binLocation || "",
        lastCostPrice: lastCost.toFixed(2),
        stockValue: (currentQty * lastCost).toFixed(2),
      });
    }
  }

  const headers = [
    "Name", "SKU", "Barcode", "Type", "Category", "Unit", "Current Qty",
    "Min Qty", "Max Qty", "Reorder Level", "Status", "Facility",
    "Storage Location", "Last Cost", "Stock Value",
  ];

  const csv = [
    `# Inventory Export`,
    `# Facility: ${facilityId || "All"}`,
    `# Type filter: ${type || "all"}  Category filter: ${category || "all"}  Low-stock only: ${lowStockOnly ? "yes" : "no"}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Total rows: ${rows.length}`,
    "",
    headers.map(csvEscape).join(","),
    ...rows.map((r) => [
      r.name, r.sku, r.barcode, r.itemType, r.category, r.unit,
      r.currentQuantity, r.minimumQuantity, r.maximumQuantity, r.reorderLevel,
      r.status, r.facilityName, r.storageLocation, r.lastCostPrice, r.stockValue,
    ].map(csvEscape).join(",")),
  ].join("\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventory-${stamp}.csv"`,
    },
  });
}
