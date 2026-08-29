// =====================================================================
// API: /api/payroll-periods/[id]/approve — POST
//   Marks the payroll period status as approved.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PAYROLL_APPROVE) && !hasPermission(session, PERMISSIONS.PAYROLL_PROCESS) && !hasPermission(session, PERMISSIONS.FINANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const period = await db.payrollPeriod.findUnique({ where: { id } });
  if (!period || period.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (period.status === "locked") {
    return NextResponse.json({ error: "Cannot approve a locked payroll period." }, { status: 400 });
  }
  if (period.status === "cancelled") {
    return NextResponse.json({ error: "Cannot approve a cancelled payroll period." }, { status: 400 });
  }

  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  // Update period + all runs in a transaction
  const result = await db.$transaction(async (tx) => {
    const updatedPeriod = await tx.payrollPeriod.update({
      where: { id },
      data: {
        status: "approved",
        approvedById: session.user.id,
        approvedAt: new Date(),
      },
    });

    const runsUpdate = await tx.payrollRun.updateMany({
      where: { payrollPeriodId: id },
      data: { status: "approved" },
    });

    return { period: updatedPeriod, runsUpdated: runsUpdate.count };
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "PAYROLL_PERIOD_APPROVED",
    resourceType: "payroll_period",
    resourceId: id,
    newValues: { status: "approved", runsUpdated: result.runsUpdated },
    reason: body.comment || body.reason,
  });

  return NextResponse.json({
    item: {
      ...result.period,
      grossPayroll: result.period.grossPayroll.toNumber(),
      totalDeductions: result.period.totalDeductions.toNumber(),
      employerContributions: result.period.employerContributions.toNumber(),
      netPayroll: result.period.netPayroll.toNumber(),
    },
    runsUpdated: result.runsUpdated,
  });
}
