// =====================================================================
// API: /api/statutory-rules
//   GET  — list statutory rules (filter by organization/facility/active/type)
//   POST — create a new statutory rule
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PAYROLL_VIEW) && !hasPermission(session, PERMISSIONS.FINANCE_VIEW) && !hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const active = url.searchParams.get("active");
  const ruleType = url.searchParams.get("ruleType");

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (ruleType) where.ruleType = ruleType;
  if (active !== null && active !== undefined) where.active = active === "true";

  const items = await db.statutoryRule.findMany({
    where,
    orderBy: [{ ruleType: "asc" }, { name: "asc" }],
    take: 500,
    include: {
      facility: { select: { id: true, name: true } },
    },
  });

  const serialized = items.map((r) => ({
    ...r,
    fixedAmount: r.fixedAmount ? r.fixedAmount.toNumber() : null,
    threshold: r.threshold ? r.threshold.toNumber() : null,
    cap: r.cap ? r.cap.toNumber() : null,
  }));

  return NextResponse.json({ items: serialized, count: serialized.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STATUTORY_RULE_MANAGE) && !hasPermission(session, PERMISSIONS.COMPENSATION_MANAGE) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE) && !hasPermission(session, PERMISSIONS.FINANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
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
    name, code, ruleType, calculationType, rate, fixedAmount, brackets,
    threshold, cap, borneBy, employerRate, effectiveFrom, effectiveTo,
    facilityId, notes,
  } = body;

  if (!name || !code || !ruleType || !effectiveFrom) {
    return NextResponse.json({ error: "name, code, ruleType, effectiveFrom are required" }, { status: 400 });
  }

  const existing = await db.statutoryRule.findUnique({
    where: { organizationId_code: { organizationId: session.user.organizationId, code } },
  });
  if (existing) {
    return NextResponse.json({ error: `Statutory rule with code ${code} already exists` }, { status: 409 });
  }

  const item = await db.statutoryRule.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      code,
      ruleType,
      calculationType: calculationType || "percentage",
      rate: rate || 0,
      fixedAmount: fixedAmount ?? null,
      brackets: brackets ? (typeof brackets === "string" ? brackets : JSON.stringify(brackets)) : null,
      threshold: threshold ?? null,
      cap: cap ?? null,
      borneBy: borneBy || "employee",
      employerRate: employerRate || 0,
      effectiveFrom: new Date(effectiveFrom),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      facilityId: facilityId || null,
      active: true,
      notes: notes || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "STATUTORY_RULE_CREATED",
    resourceType: "statutory_rule",
    resourceId: item.id,
    newValues: { name, code, ruleType, calculationType, rate },
  });

  return NextResponse.json({
    item: {
      ...item,
      fixedAmount: item.fixedAmount ? item.fixedAmount.toNumber() : null,
      threshold: item.threshold ? item.threshold.toNumber() : null,
      cap: item.cap ? item.cap.toNumber() : null,
    },
  }, { status: 201 });
}
