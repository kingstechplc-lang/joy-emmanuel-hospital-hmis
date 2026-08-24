// =====================================================================
// API: /api/services/packages
//   GET  — list service packages
//   POST — create a service package with component services
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
  const status = url.searchParams.get("status") || "active";
  const q = url.searchParams.get("q") || "";

  const where: any = { organizationId: session.user.organizationId };
  if (status && status !== "all") where.status = status;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const packages = await db.servicePackage.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      components: {
        include: { service: { select: { id: true, name: true, code: true, defaultPrice: true } } },
        orderBy: { sortOrder: "asc" },
      },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({ items: packages, count: packages.length });
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, code, description, packagePrice, nhisPrice, effectiveFrom, effectiveTo, components } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  }

  // Duplicate code check
  const existing = await db.servicePackage.findFirst({
    where: { organizationId: session.user.organizationId, code: { equals: code, mode: "insensitive" } },
  });
  if (existing) {
    return NextResponse.json({ error: `Package with code "${code}" already exists`, code: "DUPLICATE_CODE" }, { status: 409 });
  }

  // Validate component services exist
  if (components && Array.isArray(components) && components.length > 0) {
    const serviceIds = components.map((c: any) => c.serviceId).filter(Boolean);
    if (serviceIds.length > 0) {
      const validServices = await db.service.findMany({
        where: { id: { in: serviceIds }, organizationId: session.user.organizationId },
        select: { id: true },
      });
      const validIds = new Set(validServices.map((s) => s.id));
      const invalid = serviceIds.filter((id: string) => !validIds.has(id));
      if (invalid.length > 0) {
        return NextResponse.json({ error: `Invalid service IDs: ${invalid.join(", ")}` }, { status: 400 });
      }
    }
  }

  const pkg = await db.servicePackage.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      code,
      description: description || null,
      packagePrice: Number(packagePrice) || 0,
      nhisPrice: nhisPrice ? Number(nhisPrice) : null,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      isActive: true,
      status: "active",
      createdById: session.user.id,
      components: components && Array.isArray(components) && components.length > 0
        ? {
            create: components.map((c: any, idx: number) => ({
              serviceId: c.serviceId,
              quantity: c.quantity || 1,
              overridePrice: c.overridePrice ? Number(c.overridePrice) : null,
              isMandatory: c.isMandatory !== false,
              sortOrder: c.sortOrder ?? idx,
            })),
          }
        : undefined,
    },
    include: {
      components: {
        include: { service: { select: { id: true, name: true, code: true, defaultPrice: true } } },
      },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SERVICE_PACKAGE_CREATED",
    resourceType: "service_package",
    resourceId: pkg.id,
    newValues: { name, code, packagePrice, componentCount: components?.length || 0 },
  });

  return NextResponse.json({ item: pkg }, { status: 201 });
}
