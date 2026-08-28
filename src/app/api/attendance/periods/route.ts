// API: /api/attendance/periods — GET (list) + POST (create period)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const facilityId = url.searchParams.get("facilityId");
  const where: any = { organizationId: session.user.organizationId };
  if (status) where.status = status;
  if (facilityId) where.facilityId = facilityId;
  const items = await db.attendancePeriod.findMany({
    where,
    orderBy: { startDate: "desc" },
    take: 100,
    include: {
      facility: { select: { id: true, name: true } },
      lockedBy: { select: { id: true, firstName: true, lastName: true } },
      approvedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, facilityId, startDate, endDate, notes } = body;
  if (!name || !startDate || !endDate) return NextResponse.json({ error: "name, startDate, endDate are required" }, { status: 400 });
  const item = await db.attendancePeriod.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null,
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: "open",
      notes,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_PERIOD_CREATED", resourceType: "attendance_period", resourceId: item.id, newValues: { name, startDate, endDate } });
  return NextResponse.json({ item }, { status: 201 });
}
