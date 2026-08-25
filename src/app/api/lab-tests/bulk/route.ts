// =====================================================================
// API: /api/lab-tests/bulk
//   POST — bulk update configurable fields on multiple tests
//   Body: { testIds: string[], updates: { category?, department?, status?, tatMinutes?,
//                                        serviceId?, nhisEligible?, priority?, availability? },
//           mode: "preview" | "commit" }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { canManageCatalog, catalogAudit } from "@/lib/lab-catalog";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const allowed = session.user.roles.includes("super_admin") ||
    (session.user.permissions || []).includes("lab_catalog.bulk_update") ||
    (session.user.permissions || []).includes("lab_catalog.manage") ||
    (session.user.permissions || []).includes("settings.manage");
  if (!allowed) return NextResponse.json({ error: "Forbidden — missing lab_catalog.bulk_update permission" }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { testIds, updates, mode } = body as { testIds: string[]; updates: any; mode?: "preview" | "commit" };
  if (!Array.isArray(testIds) || testIds.length === 0) {
    return NextResponse.json({ error: "testIds[] is required" }, { status: 400 });
  }
  if (!updates || Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "updates is required" }, { status: 400 });
  }

  // Whitelisted fields
  const allowedFields = new Set([
    "category", "status", "priority", "tatMinutes", "tatRoutineMin", "tatUrgentMin", "tatStatMin",
    "serviceId", "nhisEligible", "nhisServiceCode", "nhisTariffRef", "claimableStatus",
    "isBillable", "billableAs", "isReferralOut", "referralLab", "testType", "resultType",
  ]);
  const updateData: any = {};
  for (const [k, v] of Object.entries(updates)) {
    if (allowedFields.has(k)) updateData[k] = v;
  }
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No supported fields in updates" }, { status: 400 });
  }
  updateData.updatedById = session.user.id;

  // Fetch matching tests (org-scoped)
  const tests = await db.laboratoryTest.findMany({
    where: { id: { in: testIds }, organizationId: session.user.organizationId },
    select: { id: true, name: true, code: true, status: true, category: true, serviceId: true },
  });

  if (mode === "preview") {
    return NextResponse.json({
      mode: "preview",
      matched: tests.length,
      requested: testIds.length,
      updates: updateData,
      preview: tests.slice(0, 20).map((t) => ({ id: t.id, name: t.name, code: t.code })),
    });
  }

  // Commit
  const result = await db.laboratoryTest.updateMany({
    where: { id: { in: tests.map((t) => t.id) } },
    data: updateData,
  });

  for (const t of tests) {
    await catalogAudit({
      session, laboratoryTestId: t.id, action: "BULK_UPDATE",
      previousValue: { name: t.name, code: t.code, status: t.status, category: t.category, serviceId: t.serviceId },
      newValue: updateData,
    });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "LAB_TEST_BULK_UPDATE",
    resourceType: "lab_test_catalog",
    newValues: { count: result.count, fields: Object.keys(updateData) },
  });

  return NextResponse.json({
    mode: "commit",
    updated: result.count,
    matched: tests.length,
    requested: testIds.length,
  });
}
