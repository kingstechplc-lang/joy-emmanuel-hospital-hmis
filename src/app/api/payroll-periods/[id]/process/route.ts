// =====================================================================
// API: /api/payroll-periods/[id]/process — POST
//   Generates PayrollRun + PayrollItem records for all active staff
//   with payroll profiles. Marks overtime records as consumed.
//   Uses db.$transaction for atomicity.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Round to 2 decimal places to keep Decimal(14,2) consistent
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Calculate tiered PAYE tax using brackets JSON
// brackets format: [{from: 0, to: 500, rate: 0}, {from: 500, to: 1000, rate: 5}, ...]
function calculateTiered(bracketsJson: string | null, base: number): { amount: number; rate: number | null } {
  if (!bracketsJson) return { amount: 0, rate: null };
  try {
    const brackets = JSON.parse(bracketsJson);
    if (!Array.isArray(brackets) || brackets.length === 0) return { amount: 0, rate: null };
    let tax = 0;
    let appliedRate: number | null = null;
    for (const b of brackets) {
      const from = Number(b.from ?? 0);
      const to = b.to === null || b.to === undefined ? Infinity : Number(b.to);
      const rate = Number(b.rate ?? 0) / 100;
      if (base > from) {
        const taxableInBand = Math.min(base, to) - from;
        if (taxableInBand > 0) {
          tax += taxableInBand * rate;
          appliedRate = rate * 100;
        }
      }
    }
    return { amount: round2(tax), rate: appliedRate };
  } catch {
    return { amount: 0, rate: null };
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PAYROLL_PROCESS) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE) && !hasPermission(session, PERMISSIONS.FINANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const period = await db.payrollPeriod.findUnique({ where: { id } });
  if (!period || period.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (period.status === "locked") {
    return NextResponse.json({ error: "Cannot process a locked payroll period." }, { status: 400 });
  }

  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  const force = body.force === true;

  // Fetch all active staff payroll profiles for this org
  const profiles = await db.staffPayrollProfile.findMany({
    where: {
      organizationId: session.user.organizationId,
      payrollStatus: "active",
    },
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, profession: true, departmentId: true, facilityId: true } },
      salaryStructure: { include: { components: true } },
    },
  });

  if (profiles.length === 0) {
    return NextResponse.json({ error: "No active staff payroll profiles found." }, { status: 400 });
  }

  // Fetch all org-level allowances and deductions (active, effective during period)
  const now = new Date();
  const allowances = await db.allowance.findMany({
    where: {
      organizationId: session.user.organizationId,
      active: true,
      OR: [
        { effectiveFrom: null },
        { effectiveFrom: { lte: period.endDate } },
      ],
      AND: [
        {
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: period.startDate } },
          ],
        },
      ],
    },
  });

  const deductions = await db.deduction.findMany({
    where: {
      organizationId: session.user.organizationId,
      active: true,
      OR: [
        { effectiveFrom: null },
        { effectiveFrom: { lte: period.endDate } },
      ],
      AND: [
        {
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: period.startDate } },
          ],
        },
      ],
    },
    orderBy: { priority: "asc" },
  });

  // Fetch statutory rules (active, effective during period)
  const statutoryRules = await db.statutoryRule.findMany({
    where: {
      organizationId: session.user.organizationId,
      active: true,
      effectiveFrom: { lte: period.endDate },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: period.startDate } },
      ],
    },
  });

  // Fetch active staff loans and salary advances with outstanding balances
  const activeLoans = await db.staffLoan.findMany({
    where: {
      organizationId: session.user.organizationId,
      status: "active",
      balance: { gt: 0 },
    },
  });
  const activeAdvances = await db.salaryAdvance.findMany({
    where: {
      organizationId: session.user.organizationId,
      status: "active",
      balance: { gt: 0 },
    },
  });

  // Pending payroll adjustments for the period
  const adjustments = await db.payrollAdjustment.findMany({
    where: {
      organizationId: session.user.organizationId,
      status: "approved",
      payrollRunId: null,
    },
  });

  // Use 1.5x hourly rate for overtime (configurable in real systems)
  const OVERTIME_RATE_MULTIPLIER = 1.5;
  // Assume 21 working days, 8 hours/day = 168 hours/month (typical Ghanaian payroll)
  const MONTHLY_HOURS = 168;

  // Begin transaction
  const result = await db.$transaction(async (tx) => {
    // If reprocessing, remove existing payroll runs for this period
    const existingRuns = await tx.payrollRun.findMany({
      where: { payrollPeriodId: id },
      select: { id: true },
    });
    if (existingRuns.length > 0) {
      if (!force) {
        throw new Error("Payroll already processed for this period. Pass { force: true } to reprocess.");
      }
      // Delete existing items + adjustments links, then runs
      await tx.payrollItem.deleteMany({ where: { payrollRunId: { in: existingRuns.map((r) => r.id) } } });
      await tx.payrollRun.deleteMany({ where: { payrollPeriodId: id } });
      // Reset consumed overtime for the period
      await tx.overtimeRecord.updateMany({
        where: { payrollPeriodId: id },
        data: { payrollConsumedAt: null, payrollPeriodId: null },
      });
    }

    const runsCreated: any[] = [];
    let totalGross = 0;
    let totalDeductions = 0;
    let totalEmployerContrib = 0;
    let totalNet = 0;
    let totalOvertimeRecordsConsumed = 0;
    const exceptions: string[] = [];

    for (const profile of profiles) {
      const staff = profile.staff;
      const basicSalary = Number(profile.basicSalary);
      if (!basicSalary || basicSalary <= 0) {
        exceptions.push(`Staff ${staff.staffNumber} (${staff.firstName} ${staff.lastName}) has no basic salary set; skipped.`);
        continue;
      }

      const items: Array<{
        itemType: string;
        name: string;
        amount: number;
        rate?: number | null;
        hours?: number | null;
        isRecurring: boolean;
        isStatutory: boolean;
        referenceType?: string | null;
        referenceId?: string | null;
      }> = [];

      // 1. Basic salary (earning)
      items.push({
        itemType: "earning",
        name: "Basic Salary",
        amount: round2(basicSalary),
        rate: null,
        hours: null,
        isRecurring: true,
        isStatutory: false,
        referenceType: null,
        referenceId: null,
      });

      let totalAllowances = 0;
      let totalOvertime = 0;
      let totalBonus = 0;

      // 2. Allowances — apply org-level recurring allowances + salary-structure components
      // Salary structure components first (if linked)
      if (profile.salaryStructure?.components) {
        for (const comp of profile.salaryStructure.components) {
          if (comp.componentType !== "earning") continue;
          let amt = 0;
          let rate: number | null = null;
          if (comp.calculationType === "percentage" && comp.percentage) {
            rate = comp.percentage;
            amt = (basicSalary * comp.percentage) / 100;
          } else {
            amt = Number(comp.amount);
          }
          if (amt <= 0) continue;
          amt = round2(amt);
          totalAllowances += amt;
          items.push({
            itemType: "allowance",
            name: comp.name,
            amount: amt,
            rate,
            hours: null,
            isRecurring: comp.isRecurring,
            isStatutory: comp.isStatutory,
            referenceType: "allowance",
            referenceId: comp.id,
          });
        }
      }

      // Org-level recurring allowances (skip if profession/dept filter doesn't match)
      for (const a of allowances) {
        if (!a.isRecurring) continue;
        // Filter by profession if set
        if (a.profession && a.profession !== staff.profession) continue;
        // Filter by facility if set
        if (a.facilityId && a.facilityId !== staff.facilityId) continue;
        // Filter by department if set
        if (a.departmentId && a.departmentId !== staff.departmentId) continue;

        let amt = 0;
        let rate: number | null = null;
        if (a.allowanceType === "percentage" && a.percentage) {
          rate = a.percentage;
          amt = (basicSalary * a.percentage) / 100;
        } else if (a.allowanceType === "fixed") {
          amt = Number(a.amount);
        } else {
          // shift_based / performance: treat as fixed for default
          amt = Number(a.amount);
        }
        if (amt <= 0) continue;
        amt = round2(amt);
        totalAllowances += amt;
        items.push({
          itemType: "allowance",
          name: a.name,
          amount: amt,
          rate,
          hours: null,
          isRecurring: a.isRecurring,
          isStatutory: false,
          referenceType: "allowance",
          referenceId: a.id,
        });
      }

      // 3. Overtime from approved OvertimeRecords where payrollConsumedAt is null
      const overtimeRecords = await tx.overtimeRecord.findMany({
        where: {
          staffId: staff.id,
          organizationId: session.user.organizationId,
          payrollConsumedAt: null,
          status: "approved",
          date: { gte: period.startDate, lte: period.endDate },
        },
      });

      const hourlyRate = basicSalary / MONTHLY_HOURS;
      const overtimeByCategory: Record<string, { amount: number; minutes: number }> = {};
      for (const ot of overtimeRecords) {
        const hours = (ot.overtimeMinutes || 0) / 60;
        // Apply category-based multiplier (default 1.5x)
        const mult =
          ot.category === "holiday" ? 2.0 :
          ot.category === "weekend" ? 1.75 :
          ot.category === "night" ? 1.5 :
          OVERTIME_RATE_MULTIPLIER;
        const amt = round2(hourlyRate * hours * mult);
        totalOvertime += amt;
        const key = ot.category || "regular";
        if (!overtimeByCategory[key]) overtimeByCategory[key] = { amount: 0, minutes: 0 };
        overtimeByCategory[key].amount += amt;
        overtimeByCategory[key].minutes += ot.overtimeMinutes || 0;

        items.push({
          itemType: "overtime",
          name: `Overtime (${key})`,
          amount: amt,
          rate: mult,
          hours,
          isRecurring: false,
          isStatutory: false,
          referenceType: "overtime",
          referenceId: ot.id,
        });
      }
      // Round overtime totals
      totalOvertime = round2(totalOvertime);

      // Mark overtime records as consumed
      if (overtimeRecords.length > 0) {
        await tx.overtimeRecord.updateMany({
          where: { id: { in: overtimeRecords.map((o) => o.id) } },
          data: { payrollConsumedAt: now, payrollPeriodId: id },
        });
        totalOvertimeRecordsConsumed += overtimeRecords.length;
      }

      // 4. Gross pay = basic + allowances + overtime
      const grossPay = round2(basicSalary + totalAllowances + totalOvertime + totalBonus);

      // 5. Deductions (sorted by priority asc — already sorted from query)
      let totalDeductionsForStaff = 0;
      for (const d of deductions) {
        if (!d.isRecurring) continue;
        if (d.facilityId && d.facilityId !== staff.facilityId) continue;
        if (d.departmentId && d.departmentId !== staff.departmentId) continue;

        let amt = 0;
        let rate: number | null = null;
        if (d.deductionType === "percentage" && d.percentage) {
          rate = d.percentage;
          amt = (grossPay * d.percentage) / 100;
        } else {
          amt = Number(d.amount);
        }
        if (amt <= 0) continue;
        amt = round2(amt);
        totalDeductionsForStaff += amt;
        items.push({
          itemType: "deduction",
          name: d.name,
          amount: amt,
          rate,
          hours: null,
          isRecurring: d.isRecurring,
          isStatutory: d.isStatutory,
          referenceType: "deduction",
          referenceId: d.id,
        });
      }

      // 6. Loan installments
      const staffLoans = activeLoans.filter((l) => l.staffId === staff.id);
      for (const loan of staffLoans) {
        const installment = Number(loan.installment);
        if (installment <= 0) continue;
        const applied = Math.min(installment, Number(loan.balance));
        const amt = round2(applied);
        totalDeductionsForStaff += amt;
        items.push({
          itemType: "deduction",
          name: `Loan Installment (${loan.id.slice(-6)})`,
          amount: amt,
          rate: null,
          hours: null,
          isRecurring: true,
          isStatutory: false,
          referenceType: "loan",
          referenceId: loan.id,
        });
        // Reduce loan balance
        await tx.staffLoan.update({
          where: { id: loan.id },
          data: { balance: Math.max(0, Number(loan.balance) - amt) },
        });
      }

      // 7. Salary advance installments
      const staffAdvances = activeAdvances.filter((a) => a.staffId === staff.id);
      for (const adv of staffAdvances) {
        const installment = Number(adv.installment);
        if (installment <= 0) continue;
        const applied = Math.min(installment, Number(adv.balance));
        const amt = round2(applied);
        totalDeductionsForStaff += amt;
        items.push({
          itemType: "deduction",
          name: `Salary Advance Repayment (${adv.id.slice(-6)})`,
          amount: amt,
          rate: null,
          hours: null,
          isRecurring: true,
          isStatutory: false,
          referenceType: "advance",
          referenceId: adv.id,
        });
        await tx.salaryAdvance.update({
          where: { id: adv.id },
          data: { balance: Math.max(0, Number(adv.balance) - amt) },
        });
      }

      // 8. Statutory rules (PAYE, SSNIT, etc.)
      let employerContributions = 0;
      for (const rule of statutoryRules) {
        if (rule.facilityId && rule.facilityId !== staff.facilityId) continue;
        // Skip tax-exempt staff
        if (profile.taxExempt && rule.ruleType === "tax") continue;

        let employeeAmount = 0;
        let employerAmount = 0;
        let rate: number | null = null;

        const baseForRule = rule.ruleType === "tax" ? grossPay : basicSalary;

        if (rule.calculationType === "tiered") {
          const tieredResult = calculateTiered(rule.brackets, grossPay);
          employeeAmount = tieredResult.amount;
          rate = tieredResult.rate;
        } else if (rule.calculationType === "percentage") {
          rate = rule.rate;
          let calcBase = baseForRule;
          // Apply threshold
          if (rule.threshold && calcBase > Number(rule.threshold)) {
            calcBase = calcBase - Number(rule.threshold);
          } else if (rule.threshold) {
            calcBase = 0;
          }
          // Apply cap
          if (rule.cap && calcBase > Number(rule.cap)) {
            calcBase = Number(rule.cap);
          }
          employeeAmount = (calcBase * rule.rate) / 100;
          if (rule.borneBy === "employer" || rule.borneBy === "shared") {
            employerAmount = (calcBase * rule.employerRate) / 100;
          }
        } else if (rule.calculationType === "fixed") {
          employeeAmount = rule.fixedAmount ? Number(rule.fixedAmount) : 0;
          if (rule.borneBy === "employer" || rule.borneBy === "shared") {
            employerAmount = (baseForRule * rule.employerRate) / 100;
          }
        }

        employeeAmount = round2(employeeAmount);
        employerAmount = round2(employerAmount);

        if (rule.borneBy === "employee") {
          if (employeeAmount > 0) {
            totalDeductionsForStaff += employeeAmount;
            items.push({
              itemType: "statutory",
              name: rule.name,
              amount: employeeAmount,
              rate,
              hours: null,
              isRecurring: true,
              isStatutory: true,
              referenceType: "statutory_rule",
              referenceId: rule.id,
            });
          }
        } else if (rule.borneBy === "employer") {
          employerContributions += employerAmount;
          if (employerAmount > 0) {
            items.push({
              itemType: "employer_contribution",
              name: `${rule.name} (Employer)`,
              amount: employerAmount,
              rate: rule.employerRate,
              hours: null,
              isRecurring: true,
              isStatutory: true,
              referenceType: "statutory_rule",
              referenceId: rule.id,
            });
          }
        } else {
          // shared
          if (employeeAmount > 0) {
            totalDeductionsForStaff += employeeAmount;
            items.push({
              itemType: "statutory",
              name: `${rule.name} (Employee)`,
              amount: employeeAmount,
              rate,
              hours: null,
              isRecurring: true,
              isStatutory: true,
              referenceType: "statutory_rule",
              referenceId: rule.id,
            });
          }
          employerContributions += employerAmount;
          if (employerAmount > 0) {
            items.push({
              itemType: "employer_contribution",
              name: `${rule.name} (Employer)`,
              amount: employerAmount,
              rate: rule.employerRate,
              hours: null,
              isRecurring: true,
              isStatutory: true,
              referenceType: "statutory_rule",
              referenceId: rule.id,
            });
          }
        }
      }
      totalDeductionsForStaff = round2(totalDeductionsForStaff);
      employerContributions = round2(employerContributions);

      // 9. Apply approved payroll adjustments
      const staffAdjustments = adjustments.filter((a) => a.staffId === staff.id);
      for (const adj of staffAdjustments) {
        const amt = round2(Number(adj.amount));
        if (adj.adjustmentType === "bonus" || adj.adjustmentType === "back_pay" || adj.adjustmentType === "allowance_correction") {
          totalBonus += amt;
          items.push({
            itemType: adj.adjustmentType === "bonus" ? "bonus" : "earning",
            name: `Adjustment: ${adj.adjustmentType.replace(/_/g, " ")}`,
            amount: amt,
            rate: null,
            hours: null,
            isRecurring: false,
            isStatutory: false,
            referenceType: null,
            referenceId: adj.id,
          });
        } else {
          totalDeductionsForStaff += amt;
          items.push({
            itemType: "deduction",
            name: `Adjustment: ${adj.adjustmentType.replace(/_/g, " ")}`,
            amount: amt,
            rate: null,
            hours: null,
            isRecurring: false,
            isStatutory: false,
            referenceType: null,
            referenceId: adj.id,
          });
        }
        // Mark adjustment as applied
        await tx.payrollAdjustment.update({
          where: { id: adj.id },
          data: { status: "applied" },
        });
      }
      totalBonus = round2(totalBonus);

      // Recompute gross with bonus
      const finalGross = round2(grossPay + totalBonus);
      const netPay = round2(finalGross - totalDeductionsForStaff);

      // Build snapshot for audit/reproducibility
      const snapshot = JSON.stringify({
        generatedAt: now.toISOString(),
        basicSalary,
        totalAllowances,
        totalOvertime,
        totalBonus,
        grossPay: finalGross,
        totalDeductions: totalDeductionsForStaff,
        employerContributions,
        netPay,
        overtimeRecords: overtimeRecords.length,
        itemsCount: items.length,
      });

      // Create PayrollRun
      const run = await tx.payrollRun.create({
        data: {
          organizationId: session.user.organizationId,
          payrollPeriodId: id,
          staffId: staff.id,
          facilityId: profile.facilityId || staff.facilityId || null,
          departmentId: profile.departmentId || staff.departmentId || null,
          basicSalary,
          totalAllowances,
          totalOvertime,
          totalBonus,
          grossPay: finalGross,
          totalDeductions: totalDeductionsForStaff,
          employerContributions,
          netPay,
          paymentStatus: "unpaid",
          status: "calculated",
          exceptions: exceptions.length > 0 ? JSON.stringify(exceptions) : null,
          snapshot,
        },
      });

      // Create PayrollItems
      for (const it of items) {
        await tx.payrollItem.create({
          data: {
            payrollRunId: run.id,
            staffId: staff.id,
            itemType: it.itemType,
            name: it.name,
            amount: it.amount,
            rate: it.rate ?? null,
            hours: it.hours ?? null,
            isRecurring: it.isRecurring,
            isStatutory: it.isStatutory,
            referenceType: it.referenceType ?? null,
            referenceId: it.referenceId ?? null,
          },
        });
      }

      runsCreated.push({
        id: run.id,
        staffId: staff.id,
        staffName: `${staff.firstName} ${staff.lastName}`,
        staffNumber: staff.staffNumber,
        basicSalary,
        totalAllowances,
        totalOvertime,
        totalBonus,
        grossPay: finalGross,
        totalDeductions: totalDeductionsForStaff,
        employerContributions,
        netPay,
        itemsCount: items.length,
      });

      totalGross += finalGross;
      totalDeductions += totalDeductionsForStaff;
      totalEmployerContrib += employerContributions;
      totalNet += netPay;
    }

    // Update period with totals + status
    const updatedPeriod = await tx.payrollPeriod.update({
      where: { id },
      data: {
        status: "processing",
        totalEmployees: runsCreated.length,
        grossPayroll: round2(totalGross),
        totalDeductions: round2(totalDeductions),
        employerContributions: round2(totalEmployerContrib),
        netPayroll: round2(totalNet),
      },
    });

    return {
      runsCreated,
      period: updatedPeriod,
      totals: {
        totalEmployees: runsCreated.length,
        totalGross: round2(totalGross),
        totalDeductions: round2(totalDeductions),
        totalEmployerContrib: round2(totalEmployerContrib),
        totalNet: round2(totalNet),
        overtimeRecordsConsumed: totalOvertimeRecordsConsumed,
      },
      exceptions,
    };
  }).catch((err: Error) => {
    return { error: err.message };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "PAYROLL_PERIOD_PROCESSED",
    resourceType: "payroll_period",
    resourceId: id,
    newValues: result.totals,
  });

  return NextResponse.json({
    ok: true,
    periodId: id,
    totals: result.totals,
    runs: result.runsCreated,
    exceptions: result.exceptions,
    runsCount: result.runsCreated.length,
  }, { status: 201 });
}
