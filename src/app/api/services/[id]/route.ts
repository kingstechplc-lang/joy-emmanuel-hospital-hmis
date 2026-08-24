// =====================================================================
// API: /api/services/[id]
//   GET    — fetch single service (with facility prices + price history + usage)
//   PATCH  — update service (all new fields + price history tracking)
//   DELETE — soft-deactivate service
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
      department: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      updatedBy: { select: { id: true, firstName: true, lastName: true } },
      facilityPrices: {
        include: { facility: { select: { id: true, name: true, code: true } } },
        orderBy: { facility: { name: "asc" } },
      },
      priceHistory: {
        orderBy: { effectiveDate: "desc" },
        take: 20,
        include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
      },
      _count: { select: { invoiceItems: true, vaccineCatalogs: true } },
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
  if (!hasPermission(session, PERMISSIONS.SETTINGS_MANAGE) && !hasPermission(session, PERMISSIONS.BILLING_CREATE)) {
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

  const existing = await db.service.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { action, facilityId, price, nhisPrice: facilityNhisPrice } = body;

  // ---- Facility price management via action ----
  if (action === "set_facility_price" && facilityId && price !== undefined) {
    const facility = await db.facility.findUnique({ where: { id: facilityId } });
    if (!facility || facility.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }

    // Get old price for history
    const existingFp = await db.facilityServicePrice.findUnique({
      where: { facilityId_serviceId: { facilityId, serviceId: id } },
    });

    const updated = await db.facilityServicePrice.upsert({
      where: { facilityId_serviceId: { facilityId, serviceId: id } },
      create: { facilityId, serviceId: id, price: Number(price), nhisPrice: facilityNhisPrice ? Number(facilityNhisPrice) : null, status: "active" },
      update: { price: Number(price), nhisPrice: facilityNhisPrice ? Number(facilityNhisPrice) : null, status: "active" },
    });

    // Record price history
    await db.servicePriceHistory.create({
      data: {
        organizationId: session.user.organizationId,
        serviceId: id,
        facilityId,
        oldPrice: existingFp?.price || null,
        newPrice: Number(price),
        priceType: "facility",
        changedById: session.user.id,
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId,
      action: "SERVICE_PRICE_UPDATED",
      resourceType: "facility_service_price",
      resourceId: updated.id,
      oldValues: { oldPrice: existingFp?.price },
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

  // ---- Default: update service scalar fields ----
  const allowedFields = [
    "name", "shortName", "code", "category", "serviceType",
    "departmentId", "unitId", "description",
    "defaultPrice", "nhisPrice", "insurancePrice", "cashPrice",
    "isBillable", "isTaxable", "nhisEligible", "nhisServiceCode",
    "unitOfMeasure", "status",
  ];

  const updateData: any = { updatedById: session.user.id };
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (["isBillable", "isTaxable", "nhisEligible"].includes(field)) {
        updateData[field] = !!body[field];
      } else if (["defaultPrice", "nhisPrice", "insurancePrice", "cashPrice"].includes(field)) {
        updateData[field] = body[field] !== null ? Number(body[field]) : null;
      } else {
        updateData[field] = body[field] || null;
      }
    }
  }

  const updated = await db.service.update({ where: { id }, data: updateData });

  // ---- Record price history if defaultPrice changed ----
  if (body.defaultPrice !== undefined && Number(body.defaultPrice) !== existing.defaultPrice) {
    await db.servicePriceHistory.create({
      data: {
        organizationId: session.user.organizationId,
        serviceId: id,
        oldPrice: existing.defaultPrice,
        newPrice: Number(body.defaultPrice),
        priceType: "default",
        reason: body.priceChangeReason || null,
        changedById: session.user.id,
      },
    });
  }

  // ---- Record NHIS price history if nhisPrice changed ----
  if (body.nhisPrice !== undefined && Number(body.nhisPrice) !== (existing.nhisPrice ?? -1)) {
    await db.servicePriceHistory.create({
      data: {
        organizationId: session.user.organizationId,
        serviceId: id,
        oldPrice: existing.nhisPrice,
        newPrice: body.nhisPrice ? Number(body.nhisPrice) : 0,
        priceType: "nhis",
        changedById: session.user.id,
      },
    });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SERVICE_UPDATED",
    resourceType: "service",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code, defaultPrice: existing.defaultPrice, nhisPrice: existing.nhisPrice, status: existing.status },
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

  // Soft-deactivate (never hard-delete)
  await db.service.update({
    where: { id },
    data: { status: "inactive", updatedById: session.user.id },
  });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SERVICE_DEACTIVATED",
    resourceType: "service",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code, status: existing.status },
  });
  return NextResponse.json({ ok: true });
}
