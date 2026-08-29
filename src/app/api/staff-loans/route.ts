// =====================================================================
// API: /api/staff-loans
//   GET  — list staff loans (filter by organization/staff/status)
//   POST — create a new staff loan
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
  const staffId = url.searchParams.get("staffId");
  const status = url.searchParams.get("status");

  const where: any = { organizationId: session.user.organizationId };
  if (staffId) where.staffId = staffId;
  if (status) where.status = status;

  const items = await db.staffLoan.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 500,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
    },
  });

  const serialized = items.map((l) => ({
    ...l,
    loanAmount: l.loanAmount.toNumber(),
    principal: l.principal.toNumber(),
    balance: l.balance.toNumber(),
    installment: l.installment.toNumber(),
  }));

  return NextResponse.json({ items: serialized, count: serialized.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LOAN_MANAGE) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE) && !hasPermission(session, PERMISSIONS.FINANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
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
    staffId, loanAmount, interestRate, principal, balance, installment,
    startDate, endDate, term, status, approvedById, approvedAt, notes,
  } = body;

  if (!staffId || !loanAmount || !term || !startDate) {
    return NextResponse.json({ error: "staffId, loanAmount, term, startDate are required" }, { status: 400 });
  }

  // Validate staff belongs to same org
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    include: { user: { select: { organizationId: true } } },
  });
  if (!staff || staff.user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid staff" }, { status: 400 });
  }

  // Compute principal/balance/installment if not provided
  const rate = interestRate || 0;
  const principalAmt = principal !== undefined ? principal : loanAmount;
  const totalInterest = (principalAmt * rate * (term / 12)) / 100;
  const totalRepayable = principalAmt + totalInterest;
  const installmentAmt = installment !== undefined ? installment : round2(totalRepayable / term);
  const balanceAmt = balance !== undefined ? balance : totalRepayable;

  const item = await db.staffLoan.create({
    data: {
      organizationId: session.user.organizationId,
      staffId,
      loanAmount,
      interestRate: rate,
      principal: principalAmt,
      balance: balanceAmt,
      installment: installmentAmt,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      term,
      status: status || "pending",
      approvedById: approvedById || null,
      approvedAt: approvedAt ? new Date(approvedAt) : null,
      notes: notes || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "STAFF_LOAN_CREATED",
    resourceType: "staff_loan",
    resourceId: item.id,
    newValues: { staffId, loanAmount, term, status: item.status },
  });

  return NextResponse.json({
    item: {
      ...item,
      loanAmount: item.loanAmount.toNumber(),
      principal: item.principal.toNumber(),
      balance: item.balance.toNumber(),
      installment: item.installment.toNumber(),
    },
  }, { status: 201 });
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
