// =====================================================================
// API: /api/services/import
//   POST — bulk import services from CSV (JSON array)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

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

  const { services } = body;
  if (!Array.isArray(services) || services.length === 0) {
    return NextResponse.json({ error: "services array is required" }, { status: 400 });
  }

  let created = 0;
  let skipped = 0;
  let updated = 0;
  const errors: { row: number; name: string; error: string }[] = [];

  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    try {
      if (!s.name || !s.code) {
        errors.push({ row: i + 1, name: s.name || "(empty)", error: "name and code are required" });
        continue;
      }

      // Check for existing by code
      const existing = await db.service.findFirst({
        where: {
          organizationId: session.user.organizationId,
          code: { equals: s.code, mode: "insensitive" },
        },
      });

      if (existing) {
        // Update existing service with new data
        await db.service.update({
          where: { id: existing.id },
          data: {
            name: s.name || existing.name,
            shortName: s.shortName || existing.shortName,
            category: s.category || existing.category,
            serviceType: s.serviceType || existing.serviceType,
            defaultPrice: s.defaultPrice !== undefined ? Number(s.defaultPrice) : existing.defaultPrice,
            nhisPrice: s.nhisPrice !== undefined ? Number(s.nhisPrice) : existing.nhisPrice,
            nhisEligible: s.nhisEligible !== undefined ? !!s.nhisEligible : existing.nhisEligible,
            nhisServiceCode: s.nhisServiceCode || existing.nhisServiceCode,
            isBillable: s.isBillable !== undefined ? !!s.isBillable : existing.isBillable,
            unitOfMeasure: s.unitOfMeasure || existing.unitOfMeasure,
            description: s.description || existing.description,
            updatedById: session.user.id,
          },
        });
        updated++;
        continue;
      }

      await db.service.create({
        data: {
          organizationId: session.user.organizationId,
          name: s.name,
          shortName: s.shortName || null,
          code: s.code,
          category: s.category || "other",
          serviceType: s.serviceType || null,
          description: s.description || null,
          defaultPrice: Number(s.defaultPrice) || 0,
          nhisPrice: s.nhisPrice ? Number(s.nhisPrice) : null,
          insurancePrice: s.insurancePrice ? Number(s.insurancePrice) : null,
          cashPrice: s.cashPrice ? Number(s.cashPrice) : null,
          isBillable: s.isBillable !== false,
          isTaxable: !!s.isTaxable,
          nhisEligible: !!s.nhisEligible,
          nhisServiceCode: s.nhisServiceCode || null,
          unitOfMeasure: s.unitOfMeasure || null,
          status: s.status || "active",
          createdById: session.user.id,
          updatedById: session.user.id,
        },
      });
      created++;
    } catch (e: any) {
      errors.push({ row: i + 1, name: s.name || "(unknown)", error: e.message });
    }
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SERVICE_BULK_IMPORT",
    resourceType: "service",
    newValues: { total: services.length, created, updated, skipped, errors: errors.length },
  });

  return NextResponse.json({ created, updated, skipped, errors }, { status: 201 });
}
