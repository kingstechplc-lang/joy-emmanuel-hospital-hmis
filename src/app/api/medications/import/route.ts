// =====================================================================
// API: /api/medications/import
//   POST — bulk import medications from CSV (JSON array of medication objects)
//   Body: { medications: [{ genericName, brandName, strength, ... }] }
//   Returns: { created, skipped, errors }
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

  const { medications } = body;
  if (!Array.isArray(medications) || medications.length === 0) {
    return NextResponse.json({ error: "medications array is required and must not be empty" }, { status: 400 });
  }

  let created = 0;
  let skipped = 0;
  const errors: { row: number; genericName: string; error: string }[] = [];

  for (let i = 0; i < medications.length; i++) {
    const m = medications[i];
    try {
      if (!m.genericName) {
        errors.push({ row: i + 1, genericName: "(empty)", error: "genericName is required" });
        continue;
      }

      // Duplicate check
      const existing = await db.medication.findFirst({
        where: {
          organizationId: session.user.organizationId,
          genericName: { equals: m.genericName, mode: "insensitive" },
          brandName: m.brandName ? { equals: m.brandName, mode: "insensitive" } : null,
          strength: m.strength || null,
          dosageForm: m.dosageForm || null,
        },
        select: { id: true },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await db.medication.create({
        data: {
          organizationId: session.user.organizationId,
          genericName: m.genericName,
          brandName: m.brandName || null,
          strength: m.strength || null,
          strengthUnit: m.strengthUnit || null,
          dosageForm: m.dosageForm || null,
          route: m.route || null,
          unit: m.unit || null,
          description: m.description || null,
          medicationCategory: m.medicationCategory || null,
          therapeuticClass: m.therapeuticClass || null,
          atcCode: m.atcCode || null,
          barcode: m.barcode || null,
          productCode: m.productCode || null,
          nhisCode: m.nhisCode || null,
          manufacturer: m.manufacturer || null,
          countryOfOrigin: m.countryOfOrigin || null,
          prescriptionStatus: m.prescriptionStatus || "prescription_required",
          controlledStatus: m.controlledStatus || null,
          isHighAlert: !!m.isHighAlert,
          pregnancyCategory: m.pregnancyCategory || null,
          lactationSafety: m.lactationSafety || null,
          defaultDose: m.defaultDose || null,
          defaultFrequency: m.defaultFrequency || null,
          defaultRoute: m.defaultRoute || null,
          defaultDuration: m.defaultDuration || null,
          formularyStatus: m.formularyStatus || "formulary",
          storageConditions: m.storageConditions || null,
          status: m.status || "active",
          createdById: session.user.id,
          updatedById: session.user.id,
        },
      });
      created++;
    } catch (e: any) {
      errors.push({ row: i + 1, genericName: m.genericName || "(unknown)", error: e.message });
    }
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "MEDICATION_BULK_IMPORT",
    resourceType: "medication",
    newValues: { total: medications.length, created, skipped, errors: errors.length },
  });

  return NextResponse.json({ created, skipped, errors }, { status: 201 });
}
