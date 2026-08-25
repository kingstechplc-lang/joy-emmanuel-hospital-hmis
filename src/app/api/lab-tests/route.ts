// =====================================================================
// API: /api/lab-tests
//   GET  — list laboratory test catalog (organization-level)
//          supports: q (name|code|alias), category, status, testType,
//                    specimenType, isPanel, billable, nhisEligible,
//                    referralOut, facilityId (availability filter),
//                    detail=full (include relations), stats=1 (dashboard)
//   POST — create a new laboratory test
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { canViewCatalog, canManageCatalog, catalogAudit, detectDuplicates, snapshotVersion } from "@/lib/lab-catalog";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/lab-tests
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewCatalog(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status") || "active";
  const testType = url.searchParams.get("testType");
  const specimenType = url.searchParams.get("specimenType");
  const isPanel = url.searchParams.get("isPanel");
  const billable = url.searchParams.get("billable");
  const nhisEligible = url.searchParams.get("nhisEligible");
  const referralOut = url.searchParams.get("referralOut");
  const facilityId = url.searchParams.get("facilityId");
  const detail = url.searchParams.get("detail") || "summary";
  const statsMode = url.searchParams.get("stats") === "1";
  const limit = parseInt(url.searchParams.get("limit") || "500");

  // ---- Stats dashboard ----
  if (statsMode) {
    const where = { organizationId: session.user.organizationId };
    const [
      total, active, inactive, retired, archived, panels, single,
      referralOutCount, nhisCount, billableCount,
      byCategoryRaw, bySpecimenRaw, byTestTypeRaw,
      withoutService, withoutRange, unavailable,
    ] = await Promise.all([
      db.laboratoryTest.count({ where }),
      db.laboratoryTest.count({ where: { ...where, status: "active" } }),
      db.laboratoryTest.count({ where: { ...where, status: "inactive" } }),
      db.laboratoryTest.count({ where: { ...where, status: "retired" } }),
      db.laboratoryTest.count({ where: { ...where, status: "archived" } }),
      db.laboratoryTest.count({ where: { ...where, isPanel: true } }),
      db.laboratoryTest.count({ where: { ...where, isPanel: false } }),
      db.laboratoryTest.count({ where: { ...where, isReferralOut: true } }),
      db.laboratoryTest.count({ where: { ...where, nhisEligible: true } }),
      db.laboratoryTest.count({ where: { ...where, isBillable: true } }),
      db.laboratoryTest.groupBy({ by: ["category"], where, _count: true, orderBy: { _count: { category: "desc" } } }),
      db.laboratoryTest.groupBy({ by: ["specimenType"], where, _count: true, orderBy: { _count: { specimenType: "desc" } }, take: 12 }),
      db.laboratoryTest.groupBy({ by: ["testType"], where, _count: true, orderBy: { _count: { testType: "desc" } } }),
      db.laboratoryTest.count({ where: { ...where, isBillable: true, serviceId: null } }),
      db.laboratoryTest.count({ where: { ...where, resultType: { in: ["numeric", "quantitative"] }, referenceRange: null, referenceRanges: { none: { status: "active" } } } }),
      db.laboratoryTest.count({ where: { ...where, status: { in: ["temporarily_unavailable", "referral_out"] } } }),
    ]);
    const recent = await db.laboratoryTest.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, name: true, code: true, category: true, status: true, updatedAt: true },
    });
    return NextResponse.json({
      total, active, inactive, retired, archived,
      panels, single, referralOut: referralOutCount, nhisCount, billableCount,
      withoutService, withoutRange, unavailable,
      byCategory: byCategoryRaw.map((r) => ({ label: r.category || "uncategorised", count: r._count })),
      bySpecimen: bySpecimenRaw.map((r) => ({ label: r.specimenType || "unspecified", count: r._count })),
      byTestType: byTestTypeRaw.map((r) => ({ label: r.testType || "unspecified", count: r._count })),
      recent,
    });
  }

  // ---- List with filters ----
  const where: any = { organizationId: session.user.organizationId };
  if (status && status !== "all") where.status = status;
  if (category) where.category = category;
  if (testType) where.testType = testType;
  if (specimenType) where.specimenType = specimenType;
  if (isPanel === "true") where.isPanel = true;
  if (isPanel === "false") where.isPanel = false;
  if (billable === "true") where.isBillable = true;
  if (billable === "false") where.isBillable = false;
  if (nhisEligible === "true") where.nhisEligible = true;
  if (referralOut === "true") where.isReferralOut = true;
  if (facilityId) {
    where.facilityAvailability = { some: { facilityId, status: "active", availability: "available" } };
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { shortName: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
      { aliases: { some: { alias: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const include: any =
    detail === "full"
      ? {
          aliases: true,
          specimenConfigs: { where: { status: "active" }, orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }] },
          components: { where: { isActive: true }, orderBy: { displayOrder: "asc" as const } },
          referenceRanges: { where: { status: "active" }, orderBy: { effectiveFrom: "desc" as const } },
          criticalValues: { where: { status: "active" } },
          resultOptions: { where: { isActive: true }, orderBy: { displayOrder: "asc" as const } },
          facilityAvailability: true,
          panelMemberships: { where: { isActive: true }, include: { componentTest: { select: { id: true, name: true, code: true, unit: true } } } },
          componentOfPanels: { where: { isActive: true }, include: { panelTest: { select: { id: true, name: true, code: true } } } },
        }
      : undefined;

  const tests = await db.laboratoryTest.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: limit,
    include,
  });

  return NextResponse.json({ items: tests, count: tests.length });
}

// POST /api/lab-tests
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session)) {
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
    name, code, shortName, displayName, description, category, testType, resultType,
    specimenType, unit, referenceRange, price, status, priority,
    isPanel, isReferralOut, referralLab, isBillable, billableAs,
    tatMinutes, tatRoutineMin, tatUrgentMin, tatStatMin,
    serviceId, nhisEligible, nhisServiceCode, nhisTariffRef, claimableStatus,
    configuration, aliases, skipDuplicateCheck,
  } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  }

  // Duplicate code check
  const existing = await db.laboratoryTest.findUnique({
    where: { organizationId_code: { organizationId: session.user.organizationId, code } },
  });
  if (existing) {
    return NextResponse.json({ error: "Test with this code already exists" }, { status: 409 });
  }

  // Duplicate detection (warn — does not block unless skipDuplicateCheck=false and exact name match)
  if (!skipDuplicateCheck) {
    const dups = await detectDuplicates(session.user.organizationId, {
      name, code, aliases: aliases || [], category, specimenType,
    });
    if (dups.length > 0) {
      // Return 409 with duplicates so the client can decide
      return NextResponse.json(
        { error: "Possible duplicate detected", duplicates: dups, code: "DUPLICATE_DETECTED" },
        { status: 409 },
      );
    }
  }

  const test = await db.laboratoryTest.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      code,
      shortName: shortName || null,
      displayName: displayName || null,
      description: description || null,
      category: category || null,
      testType: testType || "single",
      resultType: resultType || "numeric",
      specimenType: specimenType || null,
      unit: unit || null,
      referenceRange: referenceRange || null,
      price: typeof price === "number" ? price : 0,
      status: status || "active",
      priority: priority || "routine",
      isPanel: !!isPanel,
      isReferralOut: !!isReferralOut,
      referralLab: referralLab || null,
      isBillable: isBillable !== undefined ? !!isBillable : true,
      billableAs: billableAs || "individual",
      tatMinutes: typeof tatMinutes === "number" ? tatMinutes : null,
      tatRoutineMin: typeof tatRoutineMin === "number" ? tatRoutineMin : null,
      tatUrgentMin: typeof tatUrgentMin === "number" ? tatUrgentMin : null,
      tatStatMin: typeof tatStatMin === "number" ? tatStatMin : null,
      serviceId: serviceId || null,
      nhisEligible: !!nhisEligible,
      nhisServiceCode: nhisServiceCode || null,
      nhisTariffRef: nhisTariffRef || null,
      claimableStatus: claimableStatus || "not_configured",
      configuration: configuration || null,
      createdById: session.user.id,
      updatedById: session.user.id,
      ...(aliases && aliases.length > 0
        ? { aliases: { create: aliases.map((a: string) => ({ alias: a })) } }
        : {}),
    },
    include: { aliases: true },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "LAB_TEST_CREATED",
    resourceType: "laboratory_test",
    resourceId: test.id,
    newValues: { name, code, category, specimenType, unit, price, testType, resultType, isPanel, serviceId },
  });
  await catalogAudit({
    session,
    laboratoryTestId: test.id,
    action: "CREATED",
    newValue: { name, code, category, testType, resultType, isPanel, isBillable, serviceId },
  });

  return NextResponse.json({ item: test }, { status: 201 });
}
