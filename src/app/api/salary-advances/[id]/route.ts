// =====================================================================
// API: /api/salary-advances/[id]
//   GET / PATCH
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PAYROLL_VIEW) && !hasPermission(session, PERMISSIONS.FINANCE_VIEW) && !hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const item = await db.salaryAdvance.findUnique({
    where: { id },
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
    },
  });

  if (!item || item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    item: {
      ...item,
      amount: item.amount.toNumber(),
      balance: item.balance.toNumber(),
      installment: item.installment.toNumber(),
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADVANCE_MANAGE) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE) && !hasPermission(session, PERMISSIONS.FINANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.salaryAdvance.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const updateData: any = {};
  const allowedFields = [
    "amount", "balance", "installment", "repaymentMonths", "reason", "status", "notes",
  ];
  for (const f of allowedFields) {
    if (body[f] !== undefined) updateData[f] = body[f];
  }
  if (body.requestDate !== undefined) updateData.requestDate = body.requestDate ? new Date(body.requestDate) : null;
  if (body.repaymentStartDate !== undefined) updateData.repaymentStartDate = body.repaymentStartDate ? new Date(body.repaymentStartDate) : null;
  if (body.approvedAt !== undefined) updateData.approvedAt = body.approvedAt ? new Date(body.approvedAt) : null;

  // Auto-fill approver when status moves to approved/active
  if ((body.status === "approved" || body.status === "active") && !existing.approvedById) {
    updateData.approvedById = session.user.id;
    if (!updateData.approvedAt) updateData.approvedAt = new Date();
  }

  delete updateData.id;
  delete updateData.organizationId;
  delete updateData.staffId;

  const updated = await db.salaryAdvance.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SALARY_ADVANCE_UPDATED",
    resourceType: "salary_advance",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({
    item: {
      ...updated,
      amount: updated.amount.toNumber(),
      balance: updated.balance.toNumber(),
      installment: updated.installment.toNumber(),
    },
  });
}
