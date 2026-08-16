// =====================================================================
// API: /api/equipment/[id]
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
  const equipment = await db.equipment.findUnique({
    where: { id },
    include: {
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      maintenance: {
        orderBy: { performedAt: "desc" },
        include: { performedBy: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  if (!equipment) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

  return NextResponse.json({ item: equipment });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_ADJUST)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const existing = await db.equipment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

  const data: any = {};
  for (const f of ["name", "category", "manufacturer", "model", "serialNumber", "status", "location"]) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  if (body.facilityId !== undefined) data.facilityId = body.facilityId || null;
  if (body.departmentId !== undefined) data.departmentId = body.departmentId || null;
  if (body.purchaseDate !== undefined) data.purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : null;
  if (body.purchasePrice !== undefined) data.purchasePrice = body.purchasePrice ? Number(body.purchasePrice) : null;
  if (body.warrantyExpiry !== undefined) data.warrantyExpiry = body.warrantyExpiry ? new Date(body.warrantyExpiry) : null;

  const updated = await db.equipment.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || session.user.facilityId || undefined,
    action: "EQUIPMENT_UPDATED",
    resourceType: "equipment",
    resourceId: id,
    oldValues: existing,
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INVENTORY_ADJUST)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.equipment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

  const updated = await db.equipment.update({
    where: { id },
    data: { status: "retired" },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || session.user.facilityId || undefined,
    action: "EQUIPMENT_RETIRED",
    resourceType: "equipment",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: { status: "retired" },
  });

  return NextResponse.json({ item: updated });
}
