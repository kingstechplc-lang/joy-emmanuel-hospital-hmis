// =====================================================================
// API: /api/medications/[id]
//   GET    — single medication with usage summary
//   PATCH  — update medication (all new fields)
//   DELETE — soft-deactivate medication
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
  if (!hasPermission(session, PERMISSIONS.PHARMACY_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const med = await db.medication.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      updatedBy: { select: { id: true, firstName: true, lastName: true } },
      _count: {
        select: { prescriptionItems: true, inventoryItems: true, administrations: true },
      },
    },
  });
  if (!med || med.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get inventory items linked to this medication (for stock summary)
  const inventoryItems = await db.inventoryItem.findMany({
    where: { medicationId: id },
    include: {
      facilityInventory: {
        select: { facilityId: true, currentQuantity: true, minimumQuantity: true },
      },
    },
    take: 20,
  });

  return NextResponse.json({ item: med, inventoryItems });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MEDICATION_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
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

  const existing = await db.medication.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Allow updating all fields
  const allowedFields = [
    "genericName", "brandName", "strength", "strengthValue", "strengthUnit",
    "dosageForm", "route", "unit", "description",
    "medicationCategory", "therapeuticClass", "atcCode",
    "barcode", "productCode", "nhisCode", "nhisTariffAmount", "nhisPrescribingLevel", "nhisUnitOfPricing",
    "manufacturer", "countryOfOrigin",
    "prescriptionStatus", "controlledStatus", "isHighAlert",
    "pregnancyCategory", "lactationSafety",
    "defaultDose", "defaultFrequency", "defaultRoute", "defaultDuration",
    "formularyStatus", "storageConditions",
    "status",
  ];

  const updateData: any = { updatedById: session.user.id };
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (field === "isHighAlert") {
        updateData[field] = !!body[field];
      } else if (field === "strengthValue") {
        updateData[field] = body[field] ? parseFloat(body[field]) : null;
      } else {
        updateData[field] = body[field] || null;
      }
    }
  }

  const updated = await db.medication.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "MEDICATION_UPDATED",
    resourceType: "medication",
    resourceId: id,
    oldValues: {
      genericName: existing.genericName,
      brandName: existing.brandName,
      strength: existing.strength,
      dosageForm: existing.dosageForm,
      route: existing.route,
      status: existing.status,
      therapeuticClass: existing.therapeuticClass,
      medicationCategory: existing.medicationCategory,
    },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MEDICATION_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.medication.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Soft-deactivate (never hard-delete)
  await db.medication.update({
    where: { id },
    data: { status: "inactive", updatedById: session.user.id },
  });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "MEDICATION_DEACTIVATED",
    resourceType: "medication",
    resourceId: id,
    oldValues: { genericName: existing.genericName, status: existing.status },
  });
  return NextResponse.json({ ok: true });
}
