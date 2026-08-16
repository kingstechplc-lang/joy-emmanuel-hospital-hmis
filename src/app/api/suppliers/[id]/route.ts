// =====================================================================
// API: /api/suppliers/[id]
//   GET, PATCH, DELETE (soft delete)
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
  const supplier = await db.supplier.findUnique({
    where: { id },
    include: { _count: { select: { purchaseOrders: true } } },
  });
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  return NextResponse.json({ item: supplier });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCUREMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const existing = await db.supplier.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const data: any = {};
  for (const f of ["name", "code", "contactPerson", "phone", "email", "address", "status"]) {
    if (body[f] !== undefined) data[f] = body[f];
  }

  // If updating code, check uniqueness
  if (body.code && body.code !== existing.code) {
    const dupe = await db.supplier.findFirst({
      where: { organizationId: existing.organizationId, code: body.code, NOT: { id } },
    });
    if (dupe) return NextResponse.json({ error: "Supplier code already exists" }, { status: 409 });
  }

  const updated = await db.supplier.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "SUPPLIER_UPDATED",
    resourceType: "supplier",
    resourceId: id,
    oldValues: existing,
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCUREMENT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.supplier.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const updated = await db.supplier.update({
    where: { id },
    data: { status: "inactive" },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "SUPPLIER_DEACTIVATED",
    resourceType: "supplier",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: { status: "inactive" },
  });

  return NextResponse.json({ item: updated });
}
