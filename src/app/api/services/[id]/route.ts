// =====================================================================
// API: /api/services/[id]
//   GET    — fetch single service (with facility prices)
//   PATCH  — update service
//   DELETE — delete service (soft: status = "inactive")
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const service = await db.service.findUnique({
    where: { id },
    include: {
      facilityPrices: {
        include: { facility: { select: { id: true, name: true, code: true } } },
        orderBy: { facility: { name: "asc" } },
      },
    },
  });
  if (!service || service.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item: service });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
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
  const { name, code, category, description, defaultPrice, status, action, facilityPrices, facilityId, price } = body;

  const existing = await db.service.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Manage facility prices via action
  if (action === "set_facility_price" && facilityId && price !== undefined) {
    // Validate facility belongs to org
    const facility = await db.facility.findUnique({ where: { id: facilityId } });
    if (!facility || facility.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
    const updated = await db.facilityServicePrice.upsert({
      where: { facilityId_serviceId: { facilityId, serviceId: id } },
      create: { facilityId, serviceId: id, price: Number(price), status: "active" },
      update: { price: Number(price), status: "active" },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId,
      action: "SERVICE_PRICE_UPDATED",
      resourceType: "facility_service_price",
      resourceId: updated.id,
      newValues: { facilityId, serviceId: id, price: Number(price) },
    });
    return NextResponse.json({ item: updated });
  }

  if (action === "delete_facility_price" && facilityId) {
    await db.facilityServicePrice.deleteMany({
      where: { facilityId, serviceId: id },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId,
      action: "SERVICE_PRICE_DELETED",
      resourceType: "facility_service_price",
      newValues: { facilityId, serviceId: id },
    });
    return NextResponse.json({ ok: true });
  }

  // Default — update service
  const updateData: any = {};
  if (typeof name === "string") updateData.name = name;
  if (typeof code === "string") updateData.code = code;
  if (typeof category === "string") updateData.category = category || null;
  if (typeof description === "string") updateData.description = description || null;
  if (typeof defaultPrice === "number") updateData.defaultPrice = defaultPrice;
  if (typeof status === "string") updateData.status = status;

  const updated = await db.service.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SERVICE_UPDATED",
    resourceType: "service",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code, defaultPrice: existing.defaultPrice },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.service.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Soft-delete via status
  await db.service.update({ where: { id }, data: { status: "inactive" } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SERVICE_DELETED",
    resourceType: "service",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code },
  });
  return NextResponse.json({ ok: true });
}
