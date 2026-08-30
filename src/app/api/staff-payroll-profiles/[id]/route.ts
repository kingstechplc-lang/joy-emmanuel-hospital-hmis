// =====================================================================
// API: /api/staff-payroll-profiles/[id]
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
  if (!hasPermission(session, PERMISSIONS.PAYROLL_VIEW) && !hasPermission(session, PERMISSIONS.FINANCE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const item = await db.staffPayrollProfile.findUnique({
    where: { id },
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true, departmentId: true, facilityId: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      salaryStructure: { select: { id: true, name: true, code: true, basicSalary: true } },
    },
  });

  if (!item || item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    item: {
      ...item,
      basicSalary: item.basicSalary.toNumber(),
      salaryStructure: item.salaryStructure
        ? { ...item.salaryStructure, basicSalary: item.salaryStructure.basicSalary.toNumber() }
        : null,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.COMPENSATION_MANAGE) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.staffPayrollProfile.findUnique({ where: { id } });
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
    "basicSalary", "payFrequency", "currency",
    "bankName", "bankAccountNumber", "bankAccountName", "paymentMethod",
    "taxIdNumber", "taxExempt", "payrollStatus",
  ];
  for (const f of allowedFields) {
    if (body[f] !== undefined) updateData[f] = body[f];
  }
  if (body.facilityId !== undefined) updateData.facilityId = body.facilityId || null;
  if (body.departmentId !== undefined) updateData.departmentId = body.departmentId || null;
  if (body.salaryStructureId !== undefined) updateData.salaryStructureId = body.salaryStructureId || null;
  if (body.effectiveDate !== undefined) updateData.effectiveDate = body.effectiveDate ? new Date(body.effectiveDate) : null;

  delete updateData.id;
  delete updateData.organizationId;
  delete updateData.staffId; // cannot reassign

  const updated = await db.staffPayrollProfile.update({
    where: { id },
    data: updateData,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true } },
      salaryStructure: { select: { id: true, name: true, code: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "STAFF_PAYROLL_PROFILE_UPDATED",
    resourceType: "staff_payroll_profile",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({
    item: { ...updated, basicSalary: updated.basicSalary.toNumber() },
  });
}
