// =====================================================================
// API: /api/services
//   GET — list services with search + filters (status=all bug FIXED)
//   POST — create service with all new fields + duplicate detection
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const category = url.searchParams.get("category");
  const serviceType = url.searchParams.get("serviceType");
  const q = url.searchParams.get("q") || "";
  const status = url.searchParams.get("status") || "active";
  const billableOnly = url.searchParams.get("billable") === "true";
  const nhisOnly = url.searchParams.get("nhis") === "true";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "500"), 1000);

  const where: any = { organizationId: session.user.organizationId };
  // FIX: Handle status="all" properly (was filtering literally)
  if (status && status !== "all") where.status = status;
  if (category && category !== "all") where.category = category;
  if (serviceType && serviceType !== "all") where.serviceType = serviceType;
  if (billableOnly) where.isBillable = true;
  if (nhisOnly) where.nhisEligible = true;

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { shortName: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { nhisServiceCode: { contains: q, mode: "insensitive" } },
    ];
  }

  const services = await db.service.findMany({
    where,
    orderBy: { name: "asc" },
    take: limit,
    include: {
      department: { select: { id: true, name: true } },
      facilityPrices: facilityId
        ? { where: { facilityId, status: "active" } }
        : { where: { status: "active" } },
      _count: { select: { invoiceItems: true } },
    },
  });

  // Flatten the price for the requested facility
  const items = services.map((s) => {
    const fp = s.facilityPrices[0];
    return {
      ...s,
      unitPrice: fp ? fp.price : s.defaultPrice,
      facilityPriceId: fp ? fp.id : null,
      facilityPrice: fp || null,
      invoiceCount: s._count?.invoiceItems || 0,
      facilityPrices: undefined,
      _count: undefined,
    };
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_MANAGE) && !hasPermission(session, PERMISSIONS.BILLING_CREATE)) {
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
    name, shortName, code, category, serviceType,
    departmentId, unitId, description,
    defaultPrice, nhisPrice, insurancePrice, cashPrice,
    isBillable, isTaxable, nhisEligible, nhisServiceCode,
    unitOfMeasure, status, facilityPrices,
  } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  }

  // ---- Duplicate code check ----
  const existing = await db.service.findFirst({
    where: {
      organizationId: session.user.organizationId,
      code: { equals: code, mode: "insensitive" },
    },
    select: { id: true, name: true, code: true, status: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: `A service with code "${code}" already exists: "${existing.name}" (status: ${existing.status}).`, code: "DUPLICATE_CODE", existingId: existing.id },
      { status: 409 }
    );
  }

  // ---- Create price history entry if defaultPrice is set ----
  const newDefaultPrice = Number(defaultPrice) || 0;

  try {
    const service = await db.service.create({
      data: {
        organizationId: session.user.organizationId,
        name,
        shortName: shortName || null,
        code,
        category: category || "other",
        serviceType: serviceType || null,
        departmentId: departmentId || null,
        unitId: unitId || null,
        description: description || null,
        defaultPrice: newDefaultPrice,
        nhisPrice: nhisPrice ? Number(nhisPrice) : null,
        insurancePrice: insurancePrice ? Number(insurancePrice) : null,
        cashPrice: cashPrice ? Number(cashPrice) : null,
        isBillable: isBillable !== false,
        isTaxable: !!isTaxable,
        nhisEligible: !!nhisEligible,
        nhisServiceCode: nhisServiceCode || null,
        unitOfMeasure: unitOfMeasure || null,
        status: status || "active",
        createdById: session.user.id,
        updatedById: session.user.id,
        ...(facilityPrices && facilityPrices.length > 0
          ? {
              facilityPrices: {
                create: facilityPrices.map((fp: any) => ({
                  facilityId: fp.facilityId,
                  price: Number(fp.price),
                  nhisPrice: fp.nhisPrice ? Number(fp.nhisPrice) : null,
                  status: "active",
                })),
              }
            }
          : {}),
      },
      include: { facilityPrices: true },
    });

    // Record initial price in history
    if (newDefaultPrice > 0) {
      await db.servicePriceHistory.create({
        data: {
          organizationId: session.user.organizationId,
          serviceId: service.id,
          oldPrice: null,
          newPrice: newDefaultPrice,
          priceType: "default",
          changedById: session.user.id,
        },
      });
    }

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "SERVICE_CREATED",
      resourceType: "service",
      resourceId: service.id,
      newValues: { name, code, category, serviceType, defaultPrice: newDefaultPrice, nhisPrice, isBillable, nhisEligible },
    });

    return NextResponse.json({ item: service }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create service" }, { status: 400 });
  }
}
