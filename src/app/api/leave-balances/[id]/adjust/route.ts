// API: /api/leave-balances/[id]/adjust — POST (manual adjustment with audit)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { computeRemainingBalance } from "@/lib/shift-engine";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEAVE_BALANCE_MANAGE) && !hasPermission(session, PERMISSIONS.LEAVE_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { adjustmentType, amount, reason } = body;
  if (!adjustmentType || !amount || !reason) return NextResponse.json({ error: "adjustmentType, amount, reason are required" }, { status: 400 });

  const balance = await db.leaveBalance.findUnique({ where: { id } });
  if (!balance || balance.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount)) return NextResponse.json({ error: "amount must be a number" }, { status: 400 });

  // Use a transaction: create adjustment record + update balance
  const result = await db.$transaction(async (tx) => {
    // Create adjustment record
    const adj = await tx.leaveBalanceAdjustment.create({
      data: {
        leaveBalanceId: balance.id,
        staffId: balance.staffId,
        adjustmentType,
        amount: numericAmount,
        reason,
        authorizedById: session.user.id,
      },
    });

    // Update balance based on adjustment type
    let newAdjustments = balance.adjustments;
    let newUsed = balance.used;
    let newCarriedForward = balance.carriedForward;
    let newAccrued = balance.accrued;

    if (adjustmentType === "credit" || adjustmentType === "accrual") {
      newAdjustments += numericAmount;
    } else if (adjustmentType === "debit") {
      newAdjustments -= numericAmount;
    } else if (adjustmentType === "carry_forward") {
      newCarriedForward += numericAmount;
    } else if (adjustmentType === "used_deduct") {
      newUsed += numericAmount;
    } else if (adjustmentType === "reset") {
      newAdjustments = 0;
      newUsed = 0;
      newCarriedForward = 0;
      newAccrued = 0;
    }

    const updated = await tx.leaveBalance.update({
      where: { id: balance.id },
      data: {
        adjustments: newAdjustments,
        used: newUsed,
        carriedForward: newCarriedForward,
        accrued: newAccrued,
        remaining: computeRemainingBalance({
          entitlement: balance.entitlement,
          accrued: newAccrued,
          used: newUsed,
          pending: balance.pending,
          carriedForward: newCarriedForward,
          adjustments: newAdjustments,
        }),
      },
    });

    return { adj, updated };
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "LEAVE_BALANCE_ADJUSTED",
    resourceType: "leave_balance",
    resourceId: balance.id,
    oldValues: { adjustments: balance.adjustments, used: balance.used, carriedForward: balance.carriedForward },
    newValues: { adjustmentType, amount: numericAmount, reason },
    reason,
  });

  return NextResponse.json({ item: result.updated, adjustment: result.adj }, { status: 201 });
}
