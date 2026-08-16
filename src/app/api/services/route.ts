// =====================================================================
// API: /api/services
//   GET — list services (catalog). Filter by ?facilityId=...&category=...&q=...
//         When facilityId is provided, includes the facility-specific price
//         (FacilityServicePrice) on each service.
//   POST — create new service (admin only). Optional: facilityPrices[].
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
  // Anyone with billing.view or settings.view can browse services
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const category = url.searchParams.get("category");
  const q = url.searchParams.get("q") || "";
  const status = url.searchParams.get("status") || "active";

  const where: any = { organizationId: session.user.organizationId, status };
  if (category) where.category = category;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { code: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const services = await db.service.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      facilityPrices: facilityId
        ? { where: { facilityId, status: "active" } }
        : { where: { status: "active" }, take: 1 },
    },
  });

  // Flatten the price for the requested facility
  const items = services.map((s) => {
    const fp = s.facilityPrices[0];
    return {
      id: s.id,
      name: s.name,
      code: s.code,
      category: s.category,
      description: s.description,
      defaultPrice: s.defaultPrice,
      unitPrice: fp ? fp.price : s.defaultPrice,
      facilityPriceId: fp ? fp.id : null,
    };
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, code, category, description, defaultPrice, facilityPrices } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  }

  try {
    const service = await db.service.create({
      data: {
        organizationId: session.user.organizationId,
        name,
        code,
        category: category || "other",
        description: description || null,
        defaultPrice: Number(defaultPrice) || 0,
        status: "active",
        ...(facilityPrices && facilityPrices.length > 0
          ? {
              facilityPrices: {
                create: facilityPrices.map((fp: any) => ({
                  facilityId: fp.facilityId,
                  price: Number(fp.price),
                  status: "active",
                })),
              }
            }
          : {}),
      },
      include: { facilityPrices: true },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "SERVICE_CREATED",
      resourceType: "service",
      resourceId: service.id,
      newValues: { name, code, category, defaultPrice },
    });

    return NextResponse.json({ item: service }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create service" }, { status: 400 });
  }
}
