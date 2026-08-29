// =====================================================================
// API: /api/salary-structures
//   GET  — list salary structures (filter by organization/facility/active)
//   POST — create a new salary structure (+ optional components)
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

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) {
    where.OR = [{ facilityId: null }, { facilityId }];
  }
  if (active !== null && active !== undefined) {
    where.active = active === "true";
  }

  const items = await db.salaryStructure.findMany({
    where,
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      facility: { select: { id: true, name: true } },
      components: { orderBy: { sortOrder: "asc" } },
      _count: { select: { staffProfiles: true } },
    },
  });

  const serialized = items.map((s) => ({
    ...s,
    basicSalary: s.basicSalary.toNumber(),
    components: s.components.map((c) => ({
      ...c,
      amount: c.amount.toNumber(),
    })),
  }));

  return NextResponse.json({ items: serialized, count: serialized.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COMPENSATION_MANAGE) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE) && !hasPermission(session, PERMISSIONS.FINANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { name, code, description, basicSalary, currency, facilityId, effectiveFrom, effectiveTo, components } = body;
  if (!name || !code || basicSalary === undefined || basicSalary === null) {
    return NextResponse.json({ error: "name, code, basicSalary are required" }, { status: 400 });
  }

  if (facilityId) {
    const facility = await db.facility.findUnique({ where: { id: facilityId } });
    if (!facility || facility.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  const existing = await db.salaryStructure.findUnique({
    where: { organizationId_code: { organizationId: session.user.organizationId, code } },
  });
  if (existing) {
    return NextResponse.json({ error: `Salary structure with code ${code} already exists` }, { status: 409 });
  }

  const item = await db.salaryStructure.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null,
      name,
      code,
      description: description || null,
      basicSalary,
      currency: currency || "GHS",
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      active: true,
      components: components && Array.isArray(components) ? {
        create: components.map((c: any, idx: number) => ({
          name: c.name,
          componentType: c.componentType || "earning",
          calculationType: c.calculationType || "fixed",
          amount: c.amount || 0,
          percentage: c.percentage ?? null,
          isTaxable: !!c.isTaxable,
          isStatutory: !!c.isStatutory,
          isRecurring: c.isRecurring !== false,
          sortOrder: c.sortOrder ?? idx,
        })),
      } : undefined,
    },
    include: { components: true },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SALARY_STRUCTURE_CREATED",
    resourceType: "salary_structure",
    resourceId: item.id,
    newValues: { name, code, basicSalary },
  });

  return NextResponse.json({
    item: {
      ...item,
      basicSalary: item.basicSalary.toNumber(),
      components: item.components.map((c) => ({ ...c, amount: c.amount.toNumber() })),
    },
  }, { status: 201 });
}
