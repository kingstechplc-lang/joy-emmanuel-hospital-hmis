// API: /api/staff-availability — GET (list) + POST (upsert)
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
  const staffId = url.searchParams.get("staffId");
  const facilityId = url.searchParams.get("facilityId");
  const date = url.searchParams.get("date");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const where: any = {};
  if (staffId) where.staffId = staffId;
  if (facilityId) where.facilityId = facilityId;
  if (date) where.date = new Date(date);
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) where.date.lte = new Date(dateTo);
  }
  // Scope by org
  const orgStaff = await db.staff.findMany({
    where: { user: { organizationId: session.user.organizationId } },
    select: { id: true },
  });
  where.staffId = { in: [...orgStaff.map((s) => s.id), ...(staffId ? [staffId] : [])].filter((v, i, a) => a.indexOf(v) === i && (orgStaff.some((s) => s.id === v) || !!staffId && v === staffId)) };
  if (staffId && !orgStaff.some((s) => s.id === staffId)) {
    return NextResponse.json({ items: [], count: 0 });
  }
  const items = await db.staffAvailability.findMany({
    where,
    orderBy: { date: "desc" },
    take: 500,
    include: { staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } } },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_AVAILABILITY_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { staffId, facilityId, date, status, reason, notes } = body;
  if (!staffId || !date || !status) return NextResponse.json({ error: "staffId, date, status are required" }, { status: 400 });
  const item = await db.staffAvailability.upsert({
    where: { staffId_date: { staffId, date: new Date(date) } },
    update: { status, reason, notes, facilityId: facilityId || null },
    create: {
      staffId,
      facilityId: facilityId || null,
      date: new Date(date),
      status,
      reason,
      notes,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "STAFF_AVAILABILITY_SET", resourceType: "staff_availability", resourceId: item.id, newValues: { staffId, date, status } });
  return NextResponse.json({ item }, { status: 201 });
}
