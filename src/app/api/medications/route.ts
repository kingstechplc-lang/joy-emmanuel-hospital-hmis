// =====================================================================
// API: /api/medications
//   GET  — list/search medications (org-level catalog) with filters
//   POST — create medication with duplicate detection
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/medications?q=...&status=active&category=...&therapeuticClass=...&form=...&route=...&barcode=...&limit=200
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PHARMACY_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const status = url.searchParams.get("status") || "active";
  const category = url.searchParams.get("category");
  const therapeuticClass = url.searchParams.get("therapeuticClass");
  const form = url.searchParams.get("form");
  const route = url.searchParams.get("route");
  const barcode = url.searchParams.get("barcode");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);

  const where: any = { organizationId: session.user.organizationId };
  if (status && status !== "all") where.status = status;
  if (category && category !== "all") where.medicationCategory = category;
  if (therapeuticClass && therapeuticClass !== "all") where.therapeuticClass = therapeuticClass;
  if (form && form !== "all") where.dosageForm = form;
  if (route && route !== "all") where.route = route;
  if (barcode) where.barcode = barcode;

  if (q) {
    where.OR = [
      { genericName: { contains: q, mode: "insensitive" } },
      { brandName: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { therapeuticClass: { contains: q, mode: "insensitive" } },
      { atcCode: { contains: q, mode: "insensitive" } },
      { barcode: { contains: q, mode: "insensitive" } },
      { productCode: { contains: q, mode: "insensitive" } },
      { manufacturer: { contains: q, mode: "insensitive" } },
    ];
  }

  const medications = await db.medication.findMany({
    where,
    orderBy: { genericName: "asc" },
    take: limit,
    include: {
      _count: {
        select: { prescriptionItems: true, inventoryItems: true },
      },
    },
  });

  return NextResponse.json({ items: medications, count: medications.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MEDICATION_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const {
    genericName, brandName, strength, strengthValue, strengthUnit,
    dosageForm, route, unit, description,
    medicationCategory, therapeuticClass, atcCode,
    barcode, productCode, nhisCode,
    manufacturer, countryOfOrigin,
    prescriptionStatus, controlledStatus, isHighAlert,
    pregnancyCategory, lactationSafety,
    defaultDose, defaultFrequency, defaultRoute, defaultDuration,
    formularyStatus, storageConditions,
    status,
  } = body;

  if (!genericName) {
    return NextResponse.json({ error: "genericName is required" }, { status: 400 });
  }

  // ---- Duplicate detection ----
  const duplicate = await db.medication.findFirst({
    where: {
      organizationId: session.user.organizationId,
      genericName: { equals: genericName, mode: "insensitive" },
      brandName: brandName ? { equals: brandName, mode: "insensitive" } : null,
      strength: strength || null,
      dosageForm: dosageForm || null,
    },
    select: { id: true, genericName: true, brandName: true, strength: true, dosageForm: true, status: true },
  });
  if (duplicate) {
    return NextResponse.json(
      {
        error: `Possible duplicate: "${duplicate.genericName}${duplicate.brandName ? ` (${duplicate.brandName})` : ""}" ${duplicate.strength || ""} ${duplicate.dosageForm || ""} already exists (status: ${duplicate.status}).`,
        code: "DUPLICATE_MEDICATION",
        existingId: duplicate.id,
      },
      { status: 409 }
    );
  }

  // ---- Barcode duplicate check ----
  if (barcode) {
    const barcodeDup = await db.medication.findFirst({
      where: { organizationId: session.user.organizationId, barcode },
      select: { id: true, genericName: true },
    });
    if (barcodeDup) {
      return NextResponse.json(
        { error: `Barcode "${barcode}" is already used by "${barcodeDup.genericName}".`, code: "DUPLICATE_BARCODE" },
        { status: 409 }
      );
    }
  }

  const med = await db.medication.create({
    data: {
      organizationId: session.user.organizationId,
      genericName,
      brandName: brandName || null,
      strength: strength || null,
      strengthValue: strengthValue || null,
      strengthUnit: strengthUnit || null,
      dosageForm: dosageForm || null,
      route: route || null,
      unit: unit || null,
      description: description || null,
      medicationCategory: medicationCategory || null,
      therapeuticClass: therapeuticClass || null,
      atcCode: atcCode || null,
      barcode: barcode || null,
      productCode: productCode || null,
      nhisCode: nhisCode || null,
      manufacturer: manufacturer || null,
      countryOfOrigin: countryOfOrigin || null,
      prescriptionStatus: prescriptionStatus || "prescription_required",
      controlledStatus: controlledStatus || null,
      isHighAlert: !!isHighAlert,
      pregnancyCategory: pregnancyCategory || null,
      lactationSafety: lactationSafety || null,
      defaultDose: defaultDose || null,
      defaultFrequency: defaultFrequency || null,
      defaultRoute: defaultRoute || null,
      defaultDuration: defaultDuration || null,
      formularyStatus: formularyStatus || "formulary",
      storageConditions: storageConditions || null,
      status: status || "active",
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "MEDICATION_CREATED",
    resourceType: "medication",
    resourceId: med.id,
    newValues: {
      genericName, brandName, strength, dosageForm, route,
      medicationCategory, therapeuticClass, atcCode, barcode,
      controlledStatus, isHighAlert, formularyStatus, prescriptionStatus,
    },
  });

  return NextResponse.json({ item: med }, { status: 201 });
}
