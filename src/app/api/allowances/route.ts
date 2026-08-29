// =====================================================================
// API: /api/allowances
//   GET  — list allowances (filter by organization/facility/active)
//   POST — create a new allowance
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
  const departmentId = url.searchParams.get("departmentId");
  const active = url.searchParams.get("active");
  const allowanceType = url.searchParams.get("allowanceType");

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (departmentId) where.departmentId = departmentId;
  if (allowanceType) where.allowanceType = allowanceType;
  if (active !== null && active !== undefined) where.active = active === "true";

  const items = await db.allowance.findMany({
    where,
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
  });

  const serialized = items.map((a) => ({
    ...a,
    amount: a.amount.toNumber(),
  }));

  return NextResponse.json({ items: serialized, count: serialized.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ALLOWANCE_MANAGE) && !hasPermission(session, PERMISSIONS.COMPENSATION_MANAGE) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE) && !hasPermission(session, PERMISSIONS.FINANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
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
    name, code, allowanceType, amount, percentage,
    isTaxable, isRecurring, facilityId, departmentId, profession,
    effectiveFrom, effectiveTo,
  } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "name, code are required" }, { status: 400 });
  }

  const existing = await db.allowance.findUnique({
    where: { organizationId_code: { organizationId: session.user.organizationId, code } },
  });
  if (existing) {
    return NextResponse.json({ error: `Allowance with code ${code} already exists` }, { status: 409 });
  }

  const item = await db.allowance.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      code,
      allowanceType: allowanceType || "fixed",
      amount: amount || 0,
      percentage: percentage ?? null,
      isTaxable: isTaxable !== false,
      isRecurring: isRecurring !== false,
      facilityId: facilityId || null,
      departmentId: departmentId || null,
      profession: profession || null,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      active: true,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "ALLOWANCE_CREATED",
    resourceType: "allowance",
    resourceId: item.id,
    newValues: { name, code, allowanceType: item.allowanceType },
  });

  return NextResponse.json({
    item: { ...item, amount: item.amount.toNumber() },
  }, { status: 201 });
}
