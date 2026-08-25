// =====================================================================
// API: /api/lab-tests/import
//   POST — bulk import lab tests with preview/validation
//   Body: { tests: Array<{ name, code, category?, specimenType?, unit?, referenceRange?,
//                        price?, testType?, resultType?, priority?, tatMinutes?,
//                        nhisEligible?, nhisServiceCode?, aliases?: string[] }>,
//           mode: "preview" | "commit" }
//   - preview: validates only, returns { valid, errors, warnings }
//   - commit:  validates then creates tests (skipping duplicates), returns { created, skipped, errors }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { canManageCatalog, catalogAudit, detectDuplicates } from "@/lib/lab-catalog";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Import requires LAB_CATALOG_IMPORT or general catalog manage
  const allowed = session.user.roles.includes("super_admin") ||
    (session.user.permissions || []).includes("lab_catalog.import") ||
    (session.user.permissions || []).includes("lab_catalog.manage") ||
    (session.user.permissions || []).includes("settings.manage");
  if (!allowed) return NextResponse.json({ error: "Forbidden — missing lab_catalog.import permission" }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { tests, mode } = body as { tests: any[]; mode?: "preview" | "commit" };
  if (!Array.isArray(tests) || tests.length === 0) {
    return NextResponse.json({ error: "tests[] is required" }, { status: 400 });
  }
  const commit = mode === "commit";

  // ---- Validation pass ----
  const errors: any[] = [];
  const warnings: any[] = [];
  const valid: any[] = [];
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();

  // Pre-fetch existing codes/names in this org for fast lookup
  const existing = await db.laboratoryTest.findMany({
    where: { organizationId: session.user.organizationId },
    select: { code: true, name: true },
  });
  const existingCodes = new Set(existing.map((t) => t.code.toLowerCase()));
  const existingNames = new Set(existing.map((t) => t.name.toLowerCase()));

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const row = i + 1;
    const rowErrors: string[] = [];
    if (!t.name || typeof t.name !== "string") rowErrors.push("name is required");
    if (!t.code || typeof t.code !== "string") rowErrors.push("code is required");
    if (t.code) {
      const lc = t.code.toLowerCase();
      if (existingCodes.has(lc)) rowErrors.push(`code "${t.code}" already exists in catalog`);
      if (seenCodes.has(lc)) rowErrors.push(`code "${t.code}" duplicated within import`);
      seenCodes.add(lc);
    }
    if (t.name) {
      const ln = t.name.toLowerCase();
      if (existingNames.has(ln)) warnings.push({ row, message: `name "${t.name}" already exists in catalog` });
      if (seenNames.has(ln)) warnings.push({ row, message: `name "${t.name}" duplicated within import` });
      seenNames.add(ln);
    }
    if (typeof t.price === "number" && t.price < 0) rowErrors.push("price must be >= 0");

    if (rowErrors.length > 0) {
      errors.push({ row, code: t.code, name: t.name, errors: rowErrors });
    } else {
      valid.push({ row, ...t });
    }
  }

  if (!commit) {
    return NextResponse.json({
      mode: "preview",
      total: tests.length,
      valid: valid.length,
      invalid: errors.length,
      errors,
      warnings,
      preview: valid.slice(0, 20).map((v) => ({
        row: v.row, name: v.name, code: v.code, category: v.category || null, specimenType: v.specimenType || null,
      })),
    });
  }

  // ---- Commit pass ----
  const created: any[] = [];
  const skipped: any[] = [];

  for (const t of valid) {
    try {
      const test = await db.laboratoryTest.create({
        data: {
          organizationId: session.user.organizationId,
          name: t.name,
          code: t.code,
          shortName: t.shortName || null,
          displayName: t.displayName || null,
          description: t.description || null,
          category: t.category || null,
          testType: t.testType || "single",
          resultType: t.resultType || "numeric",
          specimenType: t.specimenType || null,
          unit: t.unit || null,
          referenceRange: t.referenceRange || null,
          price: typeof t.price === "number" ? t.price : 0,
          status: "active",
          priority: t.priority || "routine",
          isPanel: !!t.isPanel,
          isReferralOut: !!t.isReferralOut,
          referralLab: t.referralLab || null,
          isBillable: t.isBillable !== undefined ? !!t.isBillable : true,
          tatMinutes: typeof t.tatMinutes === "number" ? t.tatMinutes : null,
          nhisEligible: !!t.nhisEligible,
          nhisServiceCode: t.nhisServiceCode || null,
          nhisTariffRef: t.nhisTariffRef || null,
          claimableStatus: t.claimableStatus || "not_configured",
          createdById: session.user.id,
          updatedById: session.user.id,
          ...(t.aliases && t.aliases.length > 0
            ? { aliases: { create: t.aliases.map((a: string) => ({ alias: a })) } }
            : {}),
        },
      });
      created.push({ id: test.id, name: test.name, code: test.code });
      await catalogAudit({
        session, laboratoryTestId: test.id, action: "CREATED",
        newValue: { name: test.name, code: test.code, category: test.category, importRow: t.row },
      });
    } catch (e: any) {
      skipped.push({ row: t.row, code: t.code, name: t.name, error: e?.message || "Unknown error" });
    }
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "LAB_TEST_BULK_IMPORT",
    resourceType: "lab_test_catalog",
    newValues: { total: tests.length, created: created.length, skipped: skipped.length, errors: errors.length },
  });

  return NextResponse.json({
    mode: "commit",
    total: tests.length,
    created: created.length,
    skipped: skipped.length,
    invalid: errors.length,
    createdItems: created,
    skippedItems: skipped,
    errors,
    warnings,
  }, { status: 201 });
}
