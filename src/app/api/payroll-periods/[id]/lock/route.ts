// =====================================================================
// API: /api/payroll-periods/[id]/lock — POST
//   Transactional: locks the payroll period + all PayrollRuns for it.
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
  if (!hasPermission(session, PERMISSIONS.PAYROLL_LOCK) && !hasPermission(session, PERMISSIONS.PAYROLL_APPROVE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const period = await db.payrollPeriod.findUnique({ where: { id } });
  if (!period || period.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (period.status === "locked") {
    return NextResponse.json({ error: "Period is already locked." }, { status: 400 });
  }
  if (period.status !== "approved" && period.status !== "paid") {
    return NextResponse.json({ error: "Period must be approved or paid before locking." }, { status: 400 });
  }

  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  const result = await db.$transaction(async (tx) => {
    // Lock all payroll runs for this period
    const runsLock = await tx.payrollRun.updateMany({
      where: { payrollPeriodId: id },
      data: { status: "locked" },
    });

    // Lock the period
    const updatedPeriod = await tx.payrollPeriod.update({
      where: { id },
      data: {
        status: "locked",
        lockedAt: new Date(),
        lockedById: session.user.id,
      },
    });

    return { period: updatedPeriod, runsLocked: runsLock.count };
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "PAYROLL_PERIOD_LOCKED",
    resourceType: "payroll_period",
    resourceId: id,
    newValues: { status: "locked", runsLocked: result.runsLocked },
    reason: body.reason || body.comment,
  });

  return NextResponse.json({
    item: {
      ...result.period,
      grossPayroll: result.period.grossPayroll.toNumber(),
      totalDeductions: result.period.totalDeductions.toNumber(),
      employerContributions: result.period.employerContributions.toNumber(),
      netPayroll: result.period.netPayroll.toNumber(),
    },
    runsLocked: result.runsLocked,
  });
}
