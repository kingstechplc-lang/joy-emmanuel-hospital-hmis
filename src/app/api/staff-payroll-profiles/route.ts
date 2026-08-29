// =====================================================================
// API: /api/staff-payroll-profiles
//   GET  — list staff payroll profiles (filter by organization/facility/status)
//   POST — create a new staff payroll profile (one per staffId)
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
  const payrollStatus = url.searchParams.get("payrollStatus");
  const staffId = url.searchParams.get("staffId");

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (departmentId) where.departmentId = departmentId;
  if (payrollStatus) where.payrollStatus = payrollStatus;
  if (staffId) where.staffId = staffId;

  const items = await db.staffPayrollProfile.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 500,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true, departmentId: true, facilityId: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      salaryStructure: { select: { id: true, name: true, code: true } },
    },
  });

  const serialized = items.map((p) => ({
    ...p,
    basicSalary: p.basicSalary.toNumber(),
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

  const {
    staffId, facilityId, departmentId, salaryStructureId,
    basicSalary, payFrequency, currency,
    bankName, bankAccountNumber, bankAccountName, paymentMethod,
    taxIdNumber, taxExempt, payrollStatus, effectiveDate,
  } = body;

  if (!staffId || basicSalary === undefined || basicSalary === null) {
    return NextResponse.json({ error: "staffId, basicSalary are required" }, { status: 400 });
  }

  // Validate staff belongs to same org
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    include: { user: { select: { organizationId: true } } },
  });
  if (!staff || staff.user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid staff" }, { status: 400 });
  }

  // Check for existing profile (staffId is unique)
  const existingProfile = await db.staffPayrollProfile.findUnique({ where: { staffId } });
  if (existingProfile) {
    return NextResponse.json({ error: "Staff already has a payroll profile" }, { status: 409 });
  }

  if (salaryStructureId) {
    const ss = await db.salaryStructure.findUnique({ where: { id: salaryStructureId } });
    if (!ss || ss.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid salary structure" }, { status: 400 });
    }
  }

  const item = await db.staffPayrollProfile.create({
    data: {
      organizationId: session.user.organizationId,
      staffId,
      facilityId: facilityId || staff.facilityId || null,
      departmentId: departmentId || staff.departmentId || null,
      salaryStructureId: salaryStructureId || null,
      basicSalary,
      payFrequency: payFrequency || "monthly",
      currency: currency || "GHS",
      bankName: bankName || null,
      bankAccountNumber: bankAccountNumber || null,
      bankAccountName: bankAccountName || null,
      paymentMethod: paymentMethod || "bank_transfer",
      taxIdNumber: taxIdNumber || staff.taxIdNumber || null,
      taxExempt: !!taxExempt,
      payrollStatus: payrollStatus || "active",
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
    },
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true } },
      salaryStructure: { select: { id: true, name: true, code: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "STAFF_PAYROLL_PROFILE_CREATED",
    resourceType: "staff_payroll_profile",
    resourceId: item.id,
    newValues: { staffId, basicSalary, payFrequency: item.payFrequency },
  });

  return NextResponse.json({
    item: { ...item, basicSalary: item.basicSalary.toNumber() },
  }, { status: 201 });
}
