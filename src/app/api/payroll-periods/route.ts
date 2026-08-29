// =====================================================================
// API: /api/payroll-periods
//   GET  — list payroll periods (filter by organization/facility/status)
//   POST — create a new payroll period
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
  const status = url.searchParams.get("status");
  const periodType = url.searchParams.get("periodType");

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (periodType) where.periodType = periodType;

  const items = await db.payrollPeriod.findMany({
    where,
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      facility: { select: { id: true, name: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { payrollRuns: true } },
    },
  });

  // Convert Decimal fields to numbers for JSON response
  const serialized = items.map((p) => ({
    ...p,
    grossPayroll: p.grossPayroll.toNumber(),
    totalDeductions: p.totalDeductions.toNumber(),
    employerContributions: p.employerContributions.toNumber(),
    netPayroll: p.netPayroll.toNumber(),
  }));

  return NextResponse.json({ items: serialized, count: serialized.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PAYROLL_CREATE) && !hasPermission(session, PERMISSIONS.PAYROLL_PROCESS) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE) && !hasPermission(session, PERMISSIONS.FINANCE_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { name, periodType, facilityId, startDate, endDate, paymentDate, notes } = body;
  if (!name || !startDate || !endDate) {
    return NextResponse.json({ error: "name, startDate, endDate are required" }, { status: 400 });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start > end) {
    return NextResponse.json({ error: "startDate must be on or before endDate" }, { status: 400 });
  }

  if (facilityId) {
    const facility = await db.facility.findUnique({ where: { id: facilityId } });
    if (!facility || facility.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  const item = await db.payrollPeriod.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null,
      name,
      periodType: periodType || "monthly",
      startDate: start,
      endDate: end,
      paymentDate: paymentDate ? new Date(paymentDate) : null,
      status: "draft",
      createdById: session.user.id,
      notes: notes || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "PAYROLL_PERIOD_CREATED",
    resourceType: "payroll_period",
    resourceId: item.id,
    newValues: { name, periodType, startDate, endDate },
  });

  return NextResponse.json({
    item: {
      ...item,
      grossPayroll: item.grossPayroll.toNumber(),
      totalDeductions: item.totalDeductions.toNumber(),
      employerContributions: item.employerContributions.toNumber(),
      netPayroll: item.netPayroll.toNumber(),
    },
  }, { status: 201 });
}
