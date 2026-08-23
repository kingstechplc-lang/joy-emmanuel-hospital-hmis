// =====================================================================
// API: /api/vaccine-catalog
//   GET  — list all active vaccines in the org's catalog
//   POST — create a new vaccine catalog entry (admin only)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/vaccine-catalog?includeInactive=true
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMMUNIZATION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("includeInactive") === "true";

  const vaccines = await db.vaccineCatalog.findMany({
    where: includeInactive ? {} : { isActive: true, organizationId: session.user.organizationId },
    include: {
      scheduleDoses: {
        where: { isActive: true },
        orderBy: { doseNumber: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ items: vaccines, count: vaccines.length });
}

// POST /api/vaccine-catalog
// Body: { code, name, genericName?, description?, diseasePrevented?, vaccineType?,
//         ageGroup?, defaultRoute?, defaultSite?, doseVolumeMl?, inventoryItemId?,
//         totalDosesInSeries?, scheduleDoses?: [{ doseNumber, doseLabel, ageAtDueDays, ageAtOverdueDays, intervalFromPreviousDoseDays?, appliesToSex? }] }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMMUNIZATION_MANAGE)) {
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
    code, name, genericName, description, diseasePrevented, vaccineType,
    ageGroup, defaultRoute, defaultSite, doseVolumeMl, inventoryItemId,
    totalDosesInSeries, scheduleDoses,
  } = body;

  if (!code || !name) {
    return NextResponse.json({ error: "code and name are required" }, { status: 400 });
  }

  // Check for duplicate code within the org
  const existing = await db.vaccineCatalog.findUnique({
    where: { organizationId_code: { organizationId: session.user.organizationId, code } },
  });
  if (existing) {
    return NextResponse.json(
      { error: `Vaccine with code "${code}" already exists in this organization` },
      { status: 409 }
    );
  }

  // Create the vaccine + its schedule doses in a transaction
  const vaccine = await db.$transaction(async (tx) => {
    const v = await tx.vaccineCatalog.create({
      data: {
        organizationId: session.user.organizationId,
        code,
        name,
        genericName: genericName || null,
        description: description || null,
        diseasePrevented: diseasePrevented || null,
        vaccineType: vaccineType || null,
        ageGroup: ageGroup || null,
        defaultRoute: defaultRoute || null,
        defaultSite: defaultSite || null,
        doseVolumeMl: doseVolumeMl || null,
        inventoryItemId: inventoryItemId || null,
        totalDosesInSeries: totalDosesInSeries || 1,
        isActive: true,
      },
    });

    // Create schedule doses if provided
    if (scheduleDoses && Array.isArray(scheduleDoses) && scheduleDoses.length > 0) {
      for (const dose of scheduleDoses) {
        await tx.vaccineScheduleDose.create({
          data: {
            organizationId: session.user.organizationId,
            vaccineCatalogId: v.id,
            doseNumber: dose.doseNumber,
            doseLabel: dose.doseLabel,
            ageAtDueDays: dose.ageAtDueDays,
            ageAtOverdueDays: dose.ageAtOverdueDays,
            intervalFromPreviousDoseDays: dose.intervalFromPreviousDoseDays || null,
            appliesToSex: dose.appliesToSex || null,
            isActive: true,
          },
        });
      }
    }

    return v;
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "VACCINE_CATALOG_CREATED",
    resourceType: "vaccineCatalog",
    resourceId: vaccine.id,
    newValues: { code, name, totalDosesInSeries },
  });

  // Reload with schedule doses
  const fullVaccine = await db.vaccineCatalog.findUnique({
    where: { id: vaccine.id },
    include: { scheduleDoses: { orderBy: { doseNumber: "asc" } } },
  });

  return NextResponse.json({ item: fullVaccine }, { status: 201 });
}
