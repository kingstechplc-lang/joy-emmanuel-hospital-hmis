// API: /api/leave-policies — GET (list) + POST (create)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const leaveTypeId = url.searchParams.get("leaveTypeId");
  const where: any = { organizationId: session.user.organizationId };
  if (leaveTypeId) where.leaveTypeId = leaveTypeId;
  const items = await db.leavePolicy.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { leaveType: true, facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEAVE_POLICY_MANAGE) && !hasPermission(session, PERMISSIONS.LEAVE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, leaveTypeId, facilityId, departmentId, eligibilityRules, approvalHierarchy, accrualFrequency, accrualAmount, carryForwardEnabled, carryForwardLimit, carryForwardExpiryMonths, negativeBalanceAllowed, negativeBalanceLimit, effectiveFrom, effectiveTo, notes } = body;
  if (!name || !leaveTypeId) return NextResponse.json({ error: "name, leaveTypeId are required" }, { status: 400 });
  const lt = await db.leaveType.findUnique({ where: { id: leaveTypeId } });
  if (!lt || lt.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Invalid leave type" }, { status: 400 });
  const item = await db.leavePolicy.create({
    data: {
      organizationId: session.user.organizationId,
      leaveTypeId,
      facilityId: facilityId || null,
      departmentId: departmentId || null,
      name,
      eligibilityRules: eligibilityRules ? JSON.stringify(eligibilityRules) : null,
      approvalHierarchy: approvalHierarchy ? JSON.stringify(approvalHierarchy) : null,
      accrualFrequency,
      accrualAmount,
      carryForwardEnabled: !!carryForwardEnabled,
      carryForwardLimit,
      carryForwardExpiryMonths,
      negativeBalanceAllowed: !!negativeBalanceAllowed,
      negativeBalanceLimit: negativeBalanceLimit || 0,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      notes,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "LEAVE_POLICY_CREATED", resourceType: "leave_policy", resourceId: item.id, newValues: { name, leaveTypeId } });
  return NextResponse.json({ item }, { status: 201 });
}
