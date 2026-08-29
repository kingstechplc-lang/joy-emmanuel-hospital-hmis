// =====================================================================
// API: /api/seed-payroll-defaults — POST
//   Seeds default statutory rules (PAYE tiered, SSNIT 5.5% employee +
//   13% employer), default allowances (Housing 15%, Transport 5%),
//   default deductions. Idempotent — skips existing entries by code.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Ghana 2024 PAYE tiered tax brackets (annualized monthly bands)
// Monthly tiers in GHS — simplified progressive schedule
const PAYE_BRACKETS = [
  { from: 0, to: 490, rate: 0 },        // 0% — first 490 GHS tax-free
  { from: 490, to: 660, rate: 5 },      // 5%
  { from: 660, to: 3160, rate: 10 },    // 10%
  { from: 3160, to: 4760, rate: 17.5 }, // 17.5%
  { from: 4760, to: 9960, rate: 25 },   // 25%
  { from: 9960, to: null, rate: 30 },   // 30% — top bracket
];

const DEFAULT_STATUTORY_RULES = [
  {
    name: "PAYE Tax (Tiered)",
    code: "PAYE",
    ruleType: "tax",
    calculationType: "tiered",
    rate: 0,
    brackets: PAYE_BRACKETS,
    borneBy: "employee",
    employerRate: 0,
    notes: "Ghana PAYE progressive tax — tiered monthly brackets.",
  },
  {
    name: "SSNIT Pension (Employee 5.5%)",
    code: "SSNIT_EMP",
    ruleType: "pension",
    calculationType: "percentage",
    rate: 5.5,
    borneBy: "employee",
    employerRate: 0,
    notes: "SSNIT 2nd-tier employee contribution: 5.5% of basic salary.",
  },
  {
    name: "SSNIT Pension (Employer 13%)",
    code: "SSNIT_EMPR",
    ruleType: "pension",
    calculationType: "percentage",
    rate: 0,
    borneBy: "employer",
    employerRate: 13,
    notes: "SSNIT 2nd-tier employer contribution: 13% of basic salary.",
  },
];

const DEFAULT_ALLOWANCES = [
  {
    name: "Housing Allowance",
    code: "HOUSING",
    allowanceType: "percentage",
    amount: 0,
    percentage: 15,
    isTaxable: true,
    isRecurring: true,
  },
  {
    name: "Transport Allowance",
    code: "TRANSPORT",
    allowanceType: "percentage",
    amount: 0,
    percentage: 5,
    isTaxable: true,
    isRecurring: true,
  },
];

const DEFAULT_DEDUCTIONS = [
  {
    name: "Union Dues",
    code: "UNION_DUES",
    deductionType: "percentage",
    amount: 0,
    percentage: 1,
    isStatutory: false,
    isRecurring: true,
    priority: 100,
  },
  {
    name: "Staff Welfare Fund",
    code: "WELFARE",
    deductionType: "fixed",
    amount: 20,
    percentage: null,
    isStatutory: false,
    isRecurring: true,
    priority: 110,
  },
];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STATUTORY_RULE_MANAGE) && !hasPermission(session, PERMISSIONS.COMPENSATION_MANAGE) && !hasPermission(session, PERMISSIONS.PAYROLL_CREATE) && !hasPermission(session, PERMISSIONS.FINANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.organizationId;
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  const facilityId = body.facilityId || null;
  const effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : new Date();

  const results = {
    statutoryRulesCreated: 0,
    statutoryRulesSkipped: 0,
    allowancesCreated: 0,
    allowancesSkipped: 0,
    deductionsCreated: 0,
    deductionsSkipped: 0,
  };

  // ---- STATUTORY RULES ----
  for (const rule of DEFAULT_STATUTORY_RULES) {
    const existing = await db.statutoryRule.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: rule.code } },
    });
    if (existing) {
      results.statutoryRulesSkipped++;
      continue;
    }
    await db.statutoryRule.create({
      data: {
        organizationId: orgId,
        name: rule.name,
        code: rule.code,
        ruleType: rule.ruleType,
        calculationType: rule.calculationType,
        rate: rule.rate,
        fixedAmount: null,
        brackets: rule.brackets ? JSON.stringify(rule.brackets) : null,
        threshold: null,
        cap: null,
        borneBy: rule.borneBy,
        employerRate: rule.employerRate,
        effectiveFrom,
        effectiveTo: null,
        facilityId,
        active: true,
        notes: rule.notes,
      },
    });
    results.statutoryRulesCreated++;
  }

  // ---- ALLOWANCES ----
  for (const a of DEFAULT_ALLOWANCES) {
    const existing = await db.allowance.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: a.code } },
    });
    if (existing) {
      results.allowancesSkipped++;
      continue;
    }
    await db.allowance.create({
      data: {
        organizationId: orgId,
        name: a.name,
        code: a.code,
        allowanceType: a.allowanceType,
        amount: a.amount,
        percentage: a.percentage,
        isTaxable: a.isTaxable,
        isRecurring: a.isRecurring,
        facilityId,
        departmentId: null,
        profession: null,
        effectiveFrom: null,
        effectiveTo: null,
        active: true,
      },
    });
    results.allowancesCreated++;
  }

  // ---- DEDUCTIONS ----
  for (const d of DEFAULT_DEDUCTIONS) {
    const existing = await db.deduction.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: d.code } },
    });
    if (existing) {
      results.deductionsSkipped++;
      continue;
    }
    await db.deduction.create({
      data: {
        organizationId: orgId,
        name: d.name,
        code: d.code,
        deductionType: d.deductionType,
        amount: d.amount,
        percentage: d.percentage,
        isStatutory: d.isStatutory,
        isRecurring: d.isRecurring,
        priority: d.priority,
        requiresApproval: false,
        facilityId,
        departmentId: null,
        effectiveFrom: null,
        effectiveTo: null,
        active: true,
      },
    });
    results.deductionsCreated++;
  }

  await auditLog({
    userId: session.user.id,
    organizationId: orgId,
    action: "PAYROLL_DEFAULTS_SEEDED",
    resourceType: "organization",
    resourceId: orgId,
    newValues: results,
  });

  return NextResponse.json({ ok: true, results });
}
