// =====================================================================
// API: /api/services/packages/[id]
//   GET    — single package with components
//   PATCH  — update package + components
//   DELETE — soft-delete package
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
  if (!hasPermission(session, PERMISSIONS.BILLING_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const pkg = await db.servicePackage.findUnique({
    where: { id },
    include: {
      components: {
        include: { service: { select: { id: true, name: true, code: true, defaultPrice: true, category: true } } },
        orderBy: { sortOrder: "asc" },
      },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!pkg || pkg.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item: pkg });
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await db.servicePackage.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { name, code, description, packagePrice, nhisPrice, effectiveFrom, effectiveTo, isActive, status, components } = body;

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (code !== undefined) updateData.code = code;
  if (description !== undefined) updateData.description = description || null;
  if (packagePrice !== undefined) updateData.packagePrice = Number(packagePrice) || 0;
  if (nhisPrice !== undefined) updateData.nhisPrice = nhisPrice ? Number(nhisPrice) : null;
  if (effectiveFrom !== undefined) updateData.effectiveFrom = effectiveFrom ? new Date(effectiveFrom) : new Date();
  if (effectiveTo !== undefined) updateData.effectiveTo = effectiveTo ? new Date(effectiveTo) : null;
  if (isActive !== undefined) updateData.isActive = !!isActive;
  if (status !== undefined) updateData.status = status;

  // If components are provided, replace all components
  if (components && Array.isArray(components)) {
    await db.servicePackageItem.deleteMany({ where: { packageId: id } });
    if (components.length > 0) {
      await db.servicePackageItem.createMany({
        data: components.map((c: any, idx: number) => ({
          packageId: id,
          serviceId: c.serviceId,
          quantity: c.quantity || 1,
          overridePrice: c.overridePrice ? Number(c.overridePrice) : null,
          isMandatory: c.isMandatory !== false,
          sortOrder: c.sortOrder ?? idx,
        })),
      });
    }
  }

  const updated = await db.servicePackage.update({
    where: { id },
    data: updateData,
    include: {
      components: {
        include: { service: { select: { id: true, name: true, code: true, defaultPrice: true } } },
      },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SERVICE_PACKAGE_UPDATED",
    resourceType: "service_package",
    resourceId: id,
    oldValues: { name: existing.name, packagePrice: existing.packagePrice, status: existing.status },
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
  const existing = await db.servicePackage.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.servicePackage.update({
    where: { id },
    data: { status: "inactive", isActive: false },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SERVICE_PACKAGE_DEACTIVATED",
    resourceType: "service_package",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code },
  });

  return NextResponse.json({ ok: true });
}
