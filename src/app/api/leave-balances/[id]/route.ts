// API: /api/leave-balances/[id] — GET / PATCH
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { computeRemainingBalance } from "@/lib/shift-engine";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.leaveBalance.findUnique({
    where: { id },
    include: { staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true } }, leaveType: true, balanceAdjustments: { orderBy: { createdAt: "desc" }, take: 20, include: { authorizedBy: { select: { id: true, firstName: true, lastName: true } } } } },
  });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const remaining = computeRemainingBalance(item);
  return NextResponse.json({ item: { ...item, computedRemaining: remaining } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEAVE_BALANCE_MANAGE) && !hasPermission(session, PERMISSIONS.LEAVE_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.leaveBalance.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { entitlement, accrued, carriedForward, carriedForwardExpiry, notes } = body;
  const updateData: any = {};
  if (entitlement !== undefined) updateData.entitlement = parseFloat(entitlement);
  if (accrued !== undefined) updateData.accrued = parseFloat(accrued);
  if (carriedForward !== undefined) updateData.carriedForward = parseFloat(carriedForward);
  if (carriedForwardExpiry !== undefined) updateData.carriedForwardExpiry = carriedForwardExpiry ? new Date(carriedForwardExpiry) : null;
  if (notes !== undefined) updateData.notes = notes;
  // Recompute remaining
  const merged = { ...existing, ...updateData };
  updateData.remaining = computeRemainingBalance(merged);
  const updated = await db.leaveBalance.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "LEAVE_BALANCE_UPDATED", resourceType: "leave_balance", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}
