// =====================================================================
// API: /api/audit-logs
//   GET — list audit logs with filters (date range, user, action, resourceType, facilityId)
//         Server-side pagination via ?offset=0&limit=50
//         Read-only — no POST/PATCH/DELETE (audit logs are append-only)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.AUDIT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  const userId = url.searchParams.get("userId");
  const action = url.searchParams.get("action");
  const resourceType = url.searchParams.get("resourceType");
  const facilityId = url.searchParams.get("facilityId");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const q = url.searchParams.get("q") || "";

  const where: any = { organizationId: session.user.organizationId };
  if (userId) where.userId = userId;
  if (action) where.action = { contains: action };
  if (resourceType) where.resourceType = resourceType;
  if (facilityId) where.facilityId = facilityId;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(`${dateTo}T23:59:59`);
  }
  if (q) {
    where.OR = [
      { action: { contains: q } },
      { resourceType: { contains: q } },
      { resourceId: { contains: q } },
      { reason: { contains: q } },
    ];
  }

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, username: true } },
        facility: { select: { id: true, name: true, code: true } },
      },
    }),
    db.auditLog.count({ where }),
  ]);

  const items = logs.map((l) => ({
    id: l.id,
    action: l.action,
    resourceType: l.resourceType,
    resourceId: l.resourceId,
    userId: l.userId,
    user: l.user,
    facilityId: l.facilityId,
    facility: l.facility,
    oldValues: l.oldValues,
    newValues: l.newValues,
    ipAddress: l.ipAddress,
    userAgent: l.userAgent,
    reason: l.reason,
    createdAt: l.createdAt,
  }));

  return NextResponse.json({ items, total, offset, limit, hasMore: offset + items.length < total });
}
