// =====================================================================
// API: /api/lab-tests/[id]
//   GET    — fetch a single test (with full relations when detail=full)
//   PATCH  — update test fields (creates version snapshot on material change)
//   DELETE — soft-delete (set status to inactive)  [use PATCH status=retired for retirement]
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { canViewCatalog, canManageCatalog, canArchiveCatalog, catalogAudit, snapshotVersion } from "@/lib/lab-catalog";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewCatalog(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const url = new URL(req.url);
  const detail = url.searchParams.get("detail") || "full";

  const test = await db.laboratoryTest.findUnique({
    where: { id },
    include:
      detail === "full"
        ? {
            aliases: true,
            specimenConfigs: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
            components: { orderBy: { displayOrder: "asc" } },
            referenceRanges: { orderBy: { effectiveFrom: "desc" } },
            criticalValues: { orderBy: { createdAt: "desc" } },
            resultOptions: { orderBy: { displayOrder: "asc" } },
            facilityAvailability: true,
            panelMemberships: {
              where: { isActive: true },
              include: { componentTest: { select: { id: true, name: true, code: true, unit: true, referenceRange: true } } },
              orderBy: { displayOrder: "asc" },
            },
            componentOfPanels: {
              where: { isActive: true },
              include: { panelTest: { select: { id: true, name: true, code: true } } },
            },
            versions: { orderBy: { version: "desc" }, take: 20 },
            catalogAudits: { orderBy: { createdAt: "desc" }, take: 20 },
          }
        : undefined,
  });
  if (!test || test.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item: test });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session)) {
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

  const existing = await db.laboratoryTest.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Status transitions requiring archive permission
  const retirementStatuses = ["retired", "archived"];
  if (typeof body.status === "string" && retirementStatuses.includes(body.status) && !canArchiveCatalog(session)) {
    return NextResponse.json({ error: "Missing permission to retire/archive tests" }, { status: 403 });
  }

  const {
    name, code, shortName, displayName, description, category, testType, resultType,
    specimenType, unit, referenceRange, price, status, priority,
    isPanel, isReferralOut, referralLab, isBillable, billableAs,
    tatMinutes, tatRoutineMin, tatUrgentMin, tatStatMin,
    serviceId, nhisEligible, nhisServiceCode, nhisTariffRef, claimableStatus,
    configuration, retirementReason,
  } = body;

  const updateData: any = {};
  if (typeof name === "string") updateData.name = name;
  if (typeof code === "string") updateData.code = code;
  if (shortName !== undefined) updateData.shortName = shortName || null;
  if (displayName !== undefined) updateData.displayName = displayName || null;
  if (description !== undefined) updateData.description = description || null;
  if (typeof category === "string") updateData.category = category || null;
  if (typeof testType === "string") updateData.testType = testType;
  if (typeof resultType === "string") updateData.resultType = resultType;
  if (typeof specimenType === "string") updateData.specimenType = specimenType || null;
  if (typeof unit === "string") updateData.unit = unit || null;
  if (typeof referenceRange === "string") updateData.referenceRange = referenceRange || null;
  if (typeof price === "number") updateData.price = price;
  if (typeof status === "string") updateData.status = status;
  if (typeof priority === "string") updateData.priority = priority;
  if (typeof isPanel === "boolean") updateData.isPanel = isPanel;
  if (typeof isReferralOut === "boolean") updateData.isReferralOut = isReferralOut;
  if (referralLab !== undefined) updateData.referralLab = referralLab || null;
  if (typeof isBillable === "boolean") updateData.isBillable = isBillable;
  if (typeof billableAs === "string") updateData.billableAs = billableAs;
  if (typeof tatMinutes === "number") updateData.tatMinutes = tatMinutes;
  if (typeof tatRoutineMin === "number") updateData.tatRoutineMin = tatRoutineMin;
  if (typeof tatUrgentMin === "number") updateData.tatUrgentMin = tatUrgentMin;
  if (typeof tatStatMin === "number") updateData.tatStatMin = tatStatMin;
  if (serviceId !== undefined) updateData.serviceId = serviceId || null;
  if (typeof nhisEligible === "boolean") updateData.nhisEligible = nhisEligible;
  if (nhisServiceCode !== undefined) updateData.nhisServiceCode = nhisServiceCode || null;
  if (nhisTariffRef !== undefined) updateData.nhisTariffRef = nhisTariffRef || null;
  if (typeof claimableStatus === "string") updateData.claimableStatus = claimableStatus;
  if (configuration !== undefined) updateData.configuration = configuration || null;
  if (typeof retirementReason === "string") updateData.retirementReason = retirementReason || null;

  // Retirement metadata
  if (status === "retired" || status === "archived") {
    updateData.retiredAt = new Date();
    updateData.retiredById = session.user.id;
    if (retirementReason) updateData.retirementReason = retirementReason;
  } else if (status === "active" && (existing.status === "retired" || existing.status === "archived")) {
    updateData.retiredAt = null;
    updateData.retiredById = null;
    updateData.retirementReason = null;
  }
  updateData.updatedById = session.user.id;

  const updated = await db.laboratoryTest.update({ where: { id }, data: updateData });

  // Material-change snapshot + catalog audit
  const materialFields = ["name", "code", "category", "testType", "resultType", "specimenType", "unit", "referenceRange", "isPanel", "isBillable", "billableAs", "serviceId", "nhisEligible", "nhisServiceCode", "status"];
  const changedMaterial = materialFields.some((f) => updateData[f] !== undefined && updateData[f] !== (existing as any)[f]);
  const changeSummary = changedMaterial
    ? `Updated: ${Object.keys(updateData).filter((k) => materialFields.includes(k)).join(", ")}`
    : null;

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "LAB_TEST_UPDATED",
    resourceType: "laboratory_test",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code, price: existing.price, status: existing.status, category: existing.category },
    newValues: updateData,
  });

  let auditAction = "UPDATED";
  if (status === "retired") auditAction = "RETIRED";
  else if (status === "archived") auditAction = "ARCHIVED";
  else if (status === "active" && (existing.status === "retired" || existing.status === "archived")) auditAction = "REACTIVATED";
  else if (status === "inactive") auditAction = "ARCHIVED";
  if (serviceId !== undefined && serviceId !== existing.serviceId) auditAction = "SERVICE_MAPPED";
  if (nhisEligible !== undefined && nhisEligible !== existing.nhisEligible) auditAction = "NHIS_MAPPED";

  await catalogAudit({
    session,
    laboratoryTestId: id,
    action: auditAction,
    previousValue: { name: existing.name, code: existing.code, status: existing.status, serviceId: existing.serviceId, nhisEligible: existing.nhisEligible },
    newValue: updateData,
    reason: retirementReason,
  });

  if (changeSummary) {
    await snapshotVersion(id, changeSummary, session.user.id).catch(() => null);
  }

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canArchiveCatalog(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.laboratoryTest.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Soft-delete → status inactive (preserve historical records)
  await db.laboratoryTest.update({
    where: { id },
    data: {
      status: "inactive",
      retiredAt: new Date(),
      retiredById: session.user.id,
      retirementReason: "Soft-deleted via admin UI",
    },
  });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "LAB_TEST_DELETED",
    resourceType: "laboratory_test",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code },
  });
  await catalogAudit({
    session,
    laboratoryTestId: id,
    action: "ARCHIVED",
    previousValue: { name: existing.name, code: existing.code, status: existing.status },
    reason: "Soft-deleted via admin UI",
  });
  return NextResponse.json({ ok: true });
}
