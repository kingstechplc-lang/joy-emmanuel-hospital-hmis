// =====================================================================
// API: /api/payroll-dashboard
//   GET — aggregated payroll statistics:
//     total periods, current period, employees on payroll,
//     gross/net payroll, pending, paid, unpaid, by department
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
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

  const orgId = session.user.organizationId;
  const periodWhere: any = { organizationId: orgId };
  const profileWhere: any = { organizationId: orgId };
  const runWhere: any = { organizationId: orgId };
  if (facilityId) {
    periodWhere.facilityId = facilityId;
    profileWhere.facilityId = facilityId;
    runWhere.facilityId = facilityId;
  }

  const now = new Date();

  const [
    totalPeriods,
    periodsByStatus,
    activeProfilesCount,
    totalRuns,
    pendingRuns,
    paidRuns,
    unpaidRuns,
    currentPeriod,
    recentPeriods,
    activeLoansCount,
    activeAdvancesCount,
    totalSalaryStructures,
    totalAllowances,
    totalDeductions,
    totalStatutoryRules,
  ] = await Promise.all([
    db.payrollPeriod.count({ where: periodWhere }),
    db.payrollPeriod.groupBy({
      by: ["status"],
      where: periodWhere,
      _count: true,
    }),
    db.staffPayrollProfile.count({ where: { ...profileWhere, payrollStatus: "active" } }),
    db.payrollRun.count({ where: runWhere }),
    db.payrollRun.count({ where: { ...runWhere, status: { in: ["draft", "calculated", "reviewed"] } } }),
    db.payrollRun.count({ where: { ...runWhere, paymentStatus: "paid" } }),
    db.payrollRun.count({ where: { ...runWhere, paymentStatus: "unpaid" } }),
    // Current period: latest period in draft/open/processing/pending_approval status
    db.payrollPeriod.findFirst({
      where: { ...periodWhere, status: { in: ["draft", "open", "processing", "pending_approval", "approved"] } },
      orderBy: { startDate: "desc" },
      include: {
        facility: { select: { id: true, name: true } },
        _count: { select: { payrollRuns: true } },
      },
    }),
    db.payrollPeriod.findMany({
      where: periodWhere,
      orderBy: { startDate: "desc" },
      take: 5,
      include: {
        facility: { select: { id: true, name: true } },
        _count: { select: { payrollRuns: true } },
      },
    }),
    db.staffLoan.count({ where: { organizationId: orgId, status: "active" } }),
    db.salaryAdvance.count({ where: { organizationId: orgId, status: "active" } }),
    db.salaryStructure.count({ where: { organizationId: orgId, active: true } }),
    db.allowance.count({ where: { organizationId: orgId, active: true } }),
    db.deduction.count({ where: { organizationId: orgId, active: true } }),
    db.statutoryRule.count({ where: { organizationId: orgId, active: true } }),
  ]);

  // Aggregate gross/net payroll across all runs
  const payrollAgg = await db.payrollRun.aggregate({
    where: runWhere,
    _sum: {
      grossPay: true,
      totalDeductions: true,
      employerContributions: true,
      netPay: true,
      basicSalary: true,
      totalAllowances: true,
      totalOvertime: true,
      totalBonus: true,
    },
  });

  // Aggregate for the current period only
  const currentPeriodAgg = currentPeriod
    ? await db.payrollRun.aggregate({
        where: { payrollPeriodId: currentPeriod.id },
        _sum: {
          grossPay: true,
          totalDeductions: true,
          employerContributions: true,
          netPay: true,
        },
        _count: true,
      })
    : null;

  // Payroll by department (for current period if available, else overall)
  const deptWhere: any = { organizationId: orgId };
  if (currentPeriod) deptWhere.payrollPeriodId = currentPeriod.id;
  const runsByDeptRaw = await db.payrollRun.groupBy({
    by: ["departmentId"],
    where: deptWhere,
    _count: true,
    _sum: {
      grossPay: true,
      netPay: true,
      totalDeductions: true,
    },
  });

  // Resolve department names
  const deptIds = runsByDeptRaw.map((r) => r.departmentId).filter(Boolean) as string[];
  const departments = deptIds.length > 0
    ? await db.department.findMany({
        where: { id: { in: deptIds } },
        select: { id: true, name: true },
      })
    : [];

  const deptMap = new Map(departments.map((d) => [d.id, d.name]));
  const byDepartment = runsByDeptRaw.map((r) => ({
    departmentId: r.departmentId,
    departmentName: r.departmentId ? (deptMap.get(r.departmentId) || "Unknown") : "Unassigned",
    employees: r._count,
    grossPay: r._sum.grossPay?.toNumber() || 0,
    netPay: r._sum.netPay?.toNumber() || 0,
    totalDeductions: r._sum.totalDeductions?.toNumber() || 0,
  }));

  // Convert Decimal fields
  const periodsByStatusMap = periodsByStatus.reduce((acc, p) => {
    acc[p.status] = p._count;
    return acc;
  }, {} as Record<string, number>);

  return NextResponse.json({
    stats: {
      totalPeriods,
      periodsByStatus: periodsByStatusMap,
      activeProfilesCount,
      totalRuns,
      pendingRuns,
      paidRuns,
      unpaidRuns,
      activeLoansCount,
      activeAdvancesCount,
      totalSalaryStructures,
      totalAllowances,
      totalDeductions,
      totalStatutoryRules,
      grossPayroll: payrollAgg._sum.grossPay?.toNumber() || 0,
      netPayroll: payrollAgg._sum.netPay?.toNumber() || 0,
      totalDeductionsAllRuns: payrollAgg._sum.totalDeductions?.toNumber() || 0,
      employerContributions: payrollAgg._sum.employerContributions?.toNumber() || 0,
      totalBasicSalary: payrollAgg._sum.basicSalary?.toNumber() || 0,
      totalAllowancesAllRuns: payrollAgg._sum.totalAllowances?.toNumber() || 0,
      totalOvertime: payrollAgg._sum.totalOvertime?.toNumber() || 0,
      totalBonus: payrollAgg._sum.totalBonus?.toNumber() || 0,
      currentPeriod: currentPeriod
        ? {
            id: currentPeriod.id,
            name: currentPeriod.name,
            status: currentPeriod.status,
            startDate: currentPeriod.startDate,
            endDate: currentPeriod.endDate,
            paymentDate: currentPeriod.paymentDate,
            grossPayroll: currentPeriod.grossPayroll.toNumber(),
            netPayroll: currentPeriod.netPayroll.toNumber(),
            totalDeductions: currentPeriod.totalDeductions.toNumber(),
            employerContributions: currentPeriod.employerContributions.toNumber(),
            totalEmployees: currentPeriod.totalEmployees,
            runsCount: currentPeriod._count.payrollRuns,
            currentPeriodAgg: currentPeriodAgg
              ? {
                  grossPay: currentPeriodAgg._sum.grossPay?.toNumber() || 0,
                  netPay: currentPeriodAgg._sum.netPay?.toNumber() || 0,
                  totalDeductions: currentPeriodAgg._sum.totalDeductions?.toNumber() || 0,
                  employerContributions: currentPeriodAgg._sum.employerContributions?.toNumber() || 0,
                  count: currentPeriodAgg._count,
                }
              : null,
          }
        : null,
    },
    byDepartment,
    recentPeriods: recentPeriods.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      startDate: p.startDate,
      endDate: p.endDate,
      grossPayroll: p.grossPayroll.toNumber(),
      netPayroll: p.netPayroll.toNumber(),
      totalEmployees: p.totalEmployees,
      runsCount: p._count.payrollRuns,
      facility: p.facility,
    })),
  });
}
