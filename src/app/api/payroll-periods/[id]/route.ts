// =====================================================================
// API: /api/payroll-periods/[id]
//   GET / PATCH / DELETE
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
  if (!hasPermission(session, PERMISSIONS.PAYROLL_VIEW) && !hasPermission(session, PERMISSIONS.FINANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const item = await db.payrollPeriod.findUnique({
    where: { id },
    include: {
      facility: { select: { id: true, name: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
      payrollRuns: {
        orderBy: { createdAt: "asc" },
        include: {
          staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, departmentId: true } },
          department: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!item || item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const serialized = {
    ...item,
    grossPayroll: item.grossPayroll.toNumber(),
    totalDeductions: item.totalDeductions.toNumber(),
    employerContributions: item.employerContributions.toNumber(),
    netPayroll: item.netPayroll.toNumber(),
    payrollRuns: item.payrollRuns.map((r) => ({
      ...r,
      basicSalary: r.basicSalary.toNumber(),
      totalAllowances: r.totalAllowances.toNumber(),
      totalOvertime: r.totalOvertime.toNumber(),
      totalBonus: r.totalBonus.toNumber(),
      grossPay: r.grossPay.toNumber(),
      totalDeductions: r.totalDeductions.toNumber(),
      employerContributions: r.employerContributions.toNumber(),
      netPay: r.netPay.toNumber(),
    })),
  };

  return NextResponse.json({ item: serialized });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PAYROLL_CREATE) && !hasPermission(session, PERMISSIONS.PAYROLL_PROCESS)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.payrollPeriod.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.status === "locked") {
    return NextResponse.json({ error: "Cannot edit a locked payroll period." }, { status: 400 });
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
    "name", "periodType", "status", "paymentDate", "notes",
    "totalEmployees", "grossPayroll", "totalDeductions",
    "employerContributions", "netPayroll",
  ];
  for (const f of allowedFields) {
    if (body[f] !== undefined) updateData[f] = body[f];
  }
  if (body.facilityId !== undefined) updateData.facilityId = body.facilityId || null;
  if (body.startDate !== undefined) updateData.startDate = new Date(body.startDate);
  if (body.endDate !== undefined) updateData.endDate = new Date(body.endDate);
  if (body.paymentDate !== undefined) updateData.paymentDate = body.paymentDate ? new Date(body.paymentDate) : null;

  delete updateData.id;
  delete updateData.organizationId;
  delete updateData.createdById;

  const updated = await db.payrollPeriod.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "PAYROLL_PERIOD_UPDATED",
    resourceType: "payroll_period",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({
    item: {
      ...updated,
      grossPayroll: updated.grossPayroll.toNumber(),
      totalDeductions: updated.totalDeductions.toNumber(),
      employerContributions: updated.employerContributions.toNumber(),
      netPayroll: updated.netPayroll.toNumber(),
    },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PAYROLL_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.payrollPeriod.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.status === "locked") {
    return NextResponse.json({ error: "Cannot delete a locked payroll period." }, { status: 400 });
  }

  // Soft delete — mark as cancelled
  await db.payrollPeriod.update({ where: { id }, data: { status: "cancelled" } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "PAYROLL_PERIOD_CANCELLED",
    resourceType: "payroll_period",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}
