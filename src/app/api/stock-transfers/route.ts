// =====================================================================
// API: /api/stock-transfers
//   GET  — list stock transfers (filtered by facility: from/to/both)
//   POST — create a stock transfer request with items
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

// GET /api/stock-transfers?facilityId=...&direction=from|to|both&status=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const direction = url.searchParams.get("direction") || "both"; // from | to | both
  const status = url.searchParams.get("status") || undefined;

  const where: any = {};
  if (facilityId) {
    if (direction === "from") where.fromFacilityId = facilityId;
    else if (direction === "to") where.toFacilityId = facilityId;
    else where.OR = [{ fromFacilityId: facilityId }, { toFacilityId: facilityId }];
  }
  if (status && status !== "all") where.status = status;

  const transfers = await db.stockTransfer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      fromFacility: { select: { id: true, name: true, code: true } },
      toFacility: { select: { id: true, name: true, code: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      items: {
        include: {
          inventoryItem: { select: { id: true, name: true, sku: true, unit: true } },
        },
      },
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json({ items: transfers, count: transfers.length });
}

// POST /api/stock-transfers
// Body: { fromFacilityId, toFacilityId, items: [{ inventoryItemId, batchId?, quantity }], notes? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_TRANSFER)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { fromFacilityId, toFacilityId, items, notes } = body;

  if (!fromFacilityId) return NextResponse.json({ error: "fromFacilityId is required" }, { status: 400 });
  if (!toFacilityId) return NextResponse.json({ error: "toFacilityId is required" }, { status: 400 });
  if (fromFacilityId === toFacilityId) {
    return NextResponse.json({ error: "Source and destination facilities must differ" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "At least one transfer item is required" }, { status: 400 });
  }

  // Generate transfer number
  const year = new Date().getFullYear();
  const count = await db.stockTransfer.count({
    where: { OR: [{ fromFacilityId }, { toFacilityId: fromFacilityId }] },
  });
  const transferNumber = `ST-${year}-${String(count + 1).padStart(6, "0")}`;

  const transfer = await db.stockTransfer.create({
    data: {
      fromFacilityId,
      toFacilityId,
      transferNumber,
      status: "requested",
      requestedById: session.user.id,
      requestedAt: new Date(),
      notes: notes || null,
      items: {
        create: items.map((it: any) => ({
          inventoryItemId: it.inventoryItemId,
          batchId: it.batchId || null,
          quantity: Number(it.quantity) || 0,
        })),
      },
    },
    include: { items: true },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: fromFacilityId,
    action: "STOCK_TRANSFER_REQUESTED",
    resourceType: "stock_transfer",
    resourceId: transfer.id,
    newValues: {
      transferNumber,
      fromFacilityId,
      toFacilityId,
      itemCount: items.length,
    },
  });

  return NextResponse.json({ item: transfer }, { status: 201 });
}
