// API: /api/leave-types — GET (list) + POST (create)
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
  const facilityId = url.searchParams.get("facilityId");
  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.OR = [{ facilityId: null }, { facilityId }];
  const items = await db.leaveType.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEAVE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, code, category, colorHex, defaultDays, accrualRatePerMonth, carryForwardLimit, carryForwardExpiryMonths, minDurationDays, maxDurationDays, noticePeriodDays, requiresDocumentation, requiresApprovalHierarchy, isSensitive, description, facilityId, sortOrder } = body;
  if (!name || !code) return NextResponse.json({ error: "name, code are required" }, { status: 400 });
  const existing = await db.leaveType.findUnique({ where: { organizationId_code: { organizationId: session.user.organizationId, code } } });
  if (existing) return NextResponse.json({ error: "Code already exists" }, { status: 409 });
  const item = await db.leaveType.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null,
      name, code,
      category: category || "paid",
      colorHex,
      defaultDays,
      accrualRatePerMonth,
      carryForwardLimit,
      carryForwardExpiryMonths,
      minDurationDays: minDurationDays || 1,
      maxDurationDays,
      noticePeriodDays,
      requiresDocumentation: !!requiresDocumentation,
      requiresApprovalHierarchy: requiresApprovalHierarchy !== false,
      isSensitive: !!isSensitive,
      description,
      sortOrder: sortOrder || 0,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "LEAVE_TYPE_CREATED", resourceType: "leave_type", resourceId: item.id, newValues: { name, code } });
  return NextResponse.json({ item }, { status: 201 });
}
