// =====================================================================
// API: /api/deductions
//   GET  — list deductions (filter by organization/facility/active)
//   POST — create a new deduction
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
  if (!hasPermission(session, PERMISSIONS.PAYROLL_VIEW) && !hasPermission(session, PERMISSIONS.FINANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const departmentId = url.searchParams.get("departmentId");
  const active = url.searchParams.get("active");
  const deductionType = url.searchParams.get("deductionType");
  const isStatutory = url.searchParams.get("isStatutory");

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (departmentId) where.departmentId = departmentId;
  if (deductionType) where.deductionType = deductionType;
  if (isStatutory !== null && isStatutory !== undefined) where.isStatutory = isStatutory === "true";
  if (active !== null && active !== undefined) where.active = active === "true";

  const items = await db.deduction.findMany({
    where,
    orderBy: [{ priority: "asc" }, { name: "asc" }],
    take: 500,
    include: {
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
  });

  const serialized = items.map((d) => ({
    ...d,
    amount: d.amount.toNumber(),
  }));

  return NextResponse.json({ items: serialized, count: serialized.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DEDUCTION_MANAGE) && !hasPermission(session, PERMISSIONS.COMPENSATION_MANAGE) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE)) {
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
    name, code, deductionType, amount, percentage,
    isStatutory, isRecurring, priority, requiresApproval,
    facilityId, departmentId, effectiveFrom, effectiveTo,
  } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "name, code are required" }, { status: 400 });
  }

  const existing = await db.deduction.findUnique({
    where: { organizationId_code: { organizationId: session.user.organizationId, code } },
  });
  if (existing) {
    return NextResponse.json({ error: `Deduction with code ${code} already exists` }, { status: 409 });
  }

  const item = await db.deduction.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      code,
      deductionType: deductionType || "fixed",
      amount: amount || 0,
      percentage: percentage ?? null,
      isStatutory: !!isStatutory,
      isRecurring: isRecurring !== false,
      priority: priority ?? 100,
      requiresApproval: !!requiresApproval,
      facilityId: facilityId || null,
      departmentId: departmentId || null,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      active: true,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "DEDUCTION_CREATED",
    resourceType: "deduction",
    resourceId: item.id,
    newValues: { name, code, deductionType: item.deductionType, priority: item.priority },
  });

  return NextResponse.json({
    item: { ...item, amount: item.amount.toNumber() },
  }, { status: 201 });
}
