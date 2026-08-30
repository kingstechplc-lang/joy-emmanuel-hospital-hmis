// =====================================================================
// API: /api/salary-advances
//   GET  — list salary advances (filter by organization/staff/status)
//   POST — create a new salary advance
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
  const staffId = url.searchParams.get("staffId");
  const status = url.searchParams.get("status");

  const where: any = { organizationId: session.user.organizationId };
  if (staffId) where.staffId = staffId;
  if (status) where.status = status;

  const items = await db.salaryAdvance.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 500,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
    },
  });

  const serialized = items.map((a) => ({
    ...a,
    amount: a.amount.toNumber(),
    balance: a.balance.toNumber(),
    installment: a.installment.toNumber(),
  }));

  return NextResponse.json({ items: serialized, count: serialized.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADVANCE_MANAGE) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE)) {
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
    staffId, amount, balance, installment, requestDate,
    repaymentStartDate, repaymentMonths, reason, status,
    approvedById, approvedAt, notes,
  } = body;

  if (!staffId || !amount) {
    return NextResponse.json({ error: "staffId, amount are required" }, { status: 400 });
  }

  // Validate staff belongs to same org
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    include: { user: { select: { organizationId: true } } },
  });
  if (!staff || staff.user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid staff" }, { status: 400 });
  }

  const months = repaymentMonths || 1;
  const installmentAmt = installment !== undefined ? installment : round2(amount / months);
  const balanceAmt = balance !== undefined ? balance : amount;

  const item = await db.salaryAdvance.create({
    data: {
      organizationId: session.user.organizationId,
      staffId,
      amount,
      balance: balanceAmt,
      installment: installmentAmt,
      requestDate: requestDate ? new Date(requestDate) : new Date(),
      repaymentStartDate: repaymentStartDate ? new Date(repaymentStartDate) : null,
      repaymentMonths: months,
      reason: reason || null,
      status: status || "pending",
      approvedById: approvedById || null,
      approvedAt: approvedAt ? new Date(approvedAt) : null,
      notes: notes || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SALARY_ADVANCE_CREATED",
    resourceType: "salary_advance",
    resourceId: item.id,
    newValues: { staffId, amount, repaymentMonths: months, status: item.status },
  });

  return NextResponse.json({
    item: {
      ...item,
      amount: item.amount.toNumber(),
      balance: item.balance.toNumber(),
      installment: item.installment.toNumber(),
    },
  }, { status: 201 });
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
