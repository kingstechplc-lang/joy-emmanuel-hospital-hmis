// =====================================================================
// LAB TEST CATALOG — shared server-side helpers
// =====================================================================
// Centralises:
//   - permission checks for catalog operations
//   - catalog audit logging (LabTestCatalogAudit + global AuditLog)
//   - duplicate detection
//   - quality check
//   - version snapshot creation
// =====================================================================
import { db } from "@/lib/db";
import type { AppSession } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

// ---------------------------------------------------------------------
// Catalog audit log (dedicated table + global AuditLog mirror)
// ---------------------------------------------------------------------
export async function catalogAudit(params: {
  session: AppSession;
  laboratoryTestId: string;
  action: string;
  previousValue?: any;
  newValue?: any;
  reason?: string;
}) {
  const { session, laboratoryTestId, action, previousValue, newValue, reason } = params;
  const user = session.user;
  try {
    await db.labTestCatalogAudit.create({
      data: {
        laboratoryTestId,
        organizationId: user.organizationId,
        facilityId: user.facilityId || null,
        action,
        previousValue: previousValue ? JSON.stringify(previousValue) : null,
        newValue: newValue ? JSON.stringify(newValue) : null,
        reason: reason || null,
        userId: user.id,
        userRole: user.roles?.join(",") || user.role,
      },
    });
  } catch (e) {
    console.error("catalogAudit failed:", e);
  }
  // Mirror to global AuditLog too
  try {
    await db.auditLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        facilityId: user.facilityId || null,
        action,
        resourceType: "lab_test_catalog",
        resourceId: laboratoryTestId,
        oldValues: previousValue ? JSON.stringify(previousValue) : null,
        newValues: newValue ? JSON.stringify(newValue) : null,
        reason: reason || null,
      },
    });
  } catch (e) {
    console.error("auditLog mirror failed:", e);
  }
}

// ---------------------------------------------------------------------
// Create a version snapshot for a test
// ---------------------------------------------------------------------
export async function snapshotVersion(
  testId: string,
  changeSummary: string | null,
  userId: string | null,
) {
  const test = await db.laboratoryTest.findUnique({
    where: { id: testId },
    include: {
      specimenConfigs: { where: { status: "active" } },
      components: { where: { isActive: true } },
      referenceRanges: { where: { status: "active" } },
      criticalValues: { where: { status: "active" } },
      resultOptions: { where: { isActive: true } },
      aliases: true,
      panelMemberships: { where: { isActive: true } },
    },
  });
  if (!test) return;
  const nextVersion = (test.version || 1) + (changeSummary ? 1 : 0);
  // Only create a new snapshot row when changeSummary is provided
  if (!changeSummary) return;
  await db.labTestVersion.create({
    data: {
      laboratoryTestId: testId,
      version: nextVersion,
      snapshot: JSON.stringify(test),
      changeSummary,
      changedById: userId,
    },
  });
  await db.laboratoryTest.update({
    where: { id: testId },
    data: { version: nextVersion },
  });
}

// ---------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------
export async function detectDuplicates(
  organizationId: string,
  data: { name?: string; code?: string; aliases?: string[]; category?: string; specimenType?: string },
  excludeId?: string,
) {
  const candidates: any[] = [];
  const filters: any[] = [];
  if (data.code) filters.push({ code: { equals: data.code, mode: "insensitive" } });
  if (data.name) filters.push({ name: { equals: data.name, mode: "insensitive" } });
  if (data.aliases && data.aliases.length > 0) {
    filters.push({ aliases: { some: { alias: { in: data.aliases, mode: "insensitive" } } } });
  }
  if (filters.length === 0) return [];
  const where: any = { organizationId, OR: filters };
  if (excludeId) where.id = { not: excludeId };
  const tests = await db.laboratoryTest.findMany({
    where,
    take: 20,
    select: {
      id: true, name: true, code: true, category: true, specimenType: true, status: true,
      aliases: { select: { alias: true } },
    },
  });
  return tests.map((t) => {
    const reasons: string[] = [];
    if (data.code && t.code.toLowerCase() === (data.code || "").toLowerCase()) reasons.push("Matching code");
    if (data.name && t.name.toLowerCase() === (data.name || "").toLowerCase()) reasons.push("Matching name");
    if (data.aliases && data.aliases.length > 0) {
      const tAliases = t.aliases.map((a) => a.alias.toLowerCase());
      if (data.aliases.some((a) => tAliases.includes(a.toLowerCase()))) reasons.push("Matching alias");
    }
    if (data.category && data.specimenType && t.category === data.category && t.specimenType === data.specimenType) {
      reasons.push("Matching category + specimen");
    }
    return { ...t, reasons };
  });
}

// ---------------------------------------------------------------------
// Quality check — returns actionable warnings for the whole catalog
// ---------------------------------------------------------------------
export async function qualityCheck(organizationId: string) {
  const tests = await db.laboratoryTest.findMany({
    where: { organizationId },
    include: {
      specimenConfigs: { where: { status: "active" } },
      referenceRanges: { where: { status: "active" } },
      criticalValues: { where: { status: "active" } },
      aliases: true,
      panelMemberships: { where: { isActive: true } },
    },
  });

  const warnings: any[] = [];

  // Duplicate codes
  const byCode: Record<string, any[]> = {};
  const byName: Record<string, any[]> = {};
  for (const t of tests) {
    const c = (t.code || "").toLowerCase();
    const n = (t.name || "").toLowerCase();
    (byCode[c] = byCode[c] || []).push(t);
    (byName[n] = byName[n] || []).push(t);
  }
  for (const [code, group] of Object.entries(byCode)) {
    if (group.length > 1) {
      warnings.push({
        severity: "error",
        type: "duplicate_code",
        message: `Duplicate test code "${code}" (${group.length} tests)`,
        testIds: group.map((t) => t.id),
        testNames: group.map((t) => `${t.name} (${t.code})`),
      });
    }
  }
  for (const [name, group] of Object.entries(byName)) {
    if (group.length > 1) {
      warnings.push({
        severity: "warning",
        type: "duplicate_name",
        message: `Possible duplicate test name "${name}" (${group.length} tests)`,
        testIds: group.map((t) => t.id),
        testNames: group.map((t) => `${t.name} (${t.code})`),
      });
    }
  }

  for (const t of tests) {
    if (!t.specimenType && t.specimenConfigs.length === 0) {
      warnings.push({
        severity: "warning",
        type: "missing_specimen",
        message: `Test "${t.name}" has no specimen configured`,
        testId: t.id,
      });
    }
    if (!t.resultType) {
      warnings.push({
        severity: "warning",
        type: "missing_result_type",
        message: `Test "${t.name}" has no result type`,
        testId: t.id,
      });
    }
    if ((t.resultType === "numeric" || t.resultType === "quantitative") && !t.unit && t.referenceRanges.length === 0) {
      warnings.push({
        severity: "warning",
        type: "missing_unit",
        message: `Numeric test "${t.name}" has no unit and no reference ranges`,
        testId: t.id,
      });
    }
    if (t.isBillable && !t.serviceId) {
      warnings.push({
        severity: "info",
        type: "missing_service",
        message: `Billable test "${t.name}" has no Service reference (pricing may not flow to billing)`,
        testId: t.id,
      });
    }
    if (!t.category) {
      warnings.push({
        severity: "warning",
        type: "missing_category",
        message: `Test "${t.name}" has no category`,
        testId: t.id,
      });
    }
    if (!t.tatMinutes && !t.tatRoutineMin) {
      warnings.push({
        severity: "info",
        type: "missing_tat",
        message: `Test "${t.name}" has no turnaround time configured`,
        testId: t.id,
      });
    }
    if (t.isPanel && t.panelMemberships.length === 0) {
      warnings.push({
        severity: "warning",
        type: "empty_panel",
        message: `Panel "${t.name}" has no component tests`,
        testId: t.id,
      });
    }
  }

  return {
    total: tests.length,
    warnings,
    summary: {
      errors: warnings.filter((w) => w.severity === "error").length,
      warnings: warnings.filter((w) => w.severity === "warning").length,
      info: warnings.filter((w) => w.severity === "info").length,
    },
  };
}

// ---------------------------------------------------------------------
// Permission helper — catalog operations
// ---------------------------------------------------------------------
export function canManageCatalog(session: AppSession | null): boolean {
  if (!session) return false;
  if (session.user.roles.includes("super_admin")) return true;
  const perms = session.user.permissions || [];
  return perms.includes(PERMISSIONS.LAB_CATALOG_MANAGE) ||
    perms.includes(PERMISSIONS.SETTINGS_MANAGE);
}

export function canArchiveCatalog(session: AppSession | null): boolean {
  if (!session) return false;
  if (session.user.roles.includes("super_admin")) return true;
  const perms = session.user.permissions || [];
  return perms.includes(PERMISSIONS.LAB_CATALOG_ARCHIVE) ||
    perms.includes(PERMISSIONS.LAB_CATALOG_MANAGE) ||
    perms.includes(PERMISSIONS.SETTINGS_MANAGE);
}

export function canViewCatalog(session: AppSession | null): boolean {
  if (!session) return false;
  if (session.user.roles.includes("super_admin")) return true;
  const perms = session.user.permissions || [];
  return perms.includes(PERMISSIONS.LAB_CATALOG_VIEW) ||
    perms.includes(PERMISSIONS.LAB_VIEW) ||
    perms.includes(PERMISSIONS.SETTINGS_VIEW);
}
