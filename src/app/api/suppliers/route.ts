// =====================================================================
// API: /api/suppliers
//   GET  — list suppliers (org-wide)
//   POST — create supplier
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/suppliers?q=...&status=active
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const status = url.searchParams.get("status") || "active";

  const where: any = { organizationId: session.user.organizationId };
  if (status && status !== "all") where.status = status;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { code: { contains: q } },
      { contactPerson: { contains: q } },
      { phone: { contains: q } },
      { email: { contains: q } },
    ];
  }

  const suppliers = await db.supplier.findMany({
    where,
    orderBy: { name: "asc" },
    take: 200,
    include: { _count: { select: { purchaseOrders: true } } },
  });

  return NextResponse.json({ items: suppliers, count: suppliers.length });
}

// POST /api/suppliers
// Body: { name, code, contactPerson?, phone?, email?, address?, status? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCUREMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { name, code, contactPerson, phone, email, address, status } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  }

  // Check code uniqueness
  const existing = await db.supplier.findFirst({
    where: { organizationId: session.user.organizationId, code },
  });
  if (existing) {
    return NextResponse.json({ error: "Supplier code already exists" }, { status: 409 });
  }

  const supplier = await db.supplier.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      code,
      contactPerson: contactPerson || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      status: status || "active",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "SUPPLIER_CREATED",
    resourceType: "supplier",
    resourceId: supplier.id,
    newValues: { name, code, contactPerson, phone, email },
  });

  return NextResponse.json({ item: supplier }, { status: 201 });
}
