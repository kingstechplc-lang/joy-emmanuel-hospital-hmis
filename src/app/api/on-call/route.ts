// API: /api/on-call — GET (list) + POST (create)
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
  const departmentId = url.searchParams.get("departmentId");
  const staffId = url.searchParams.get("staffId");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const status = url.searchParams.get("status");

  const orgFacilities = await db.facility.findMany({ where: { organizationId: session.user.organizationId }, select: { id: true } });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { facilityId: { in: orgFacilityIds } };
  if (facilityId) where.facilityId = facilityId;
  if (departmentId) where.departmentId = departmentId;
  if (staffId) where.staffId = staffId;
  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.startDate = {};
    if (dateFrom) where.startDate.gte = new Date(dateFrom);
    if (dateTo) where.startDate.lte = new Date(dateTo);
  }

  const items = await db.onCallSchedule.findMany({
    where,
    orderBy: { startDate: "desc" },
    take: 500,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true, phone: true } },
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ON_CALL_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { staffId, facilityId, departmentId, specialty, startDate, endDate, isPrimary, isBackup, contactMethod, contactValue, escalationOrder, notes } = body;
  if (!staffId || !facilityId || !startDate) return NextResponse.json({ error: "staffId, facilityId, startDate are required" }, { status: 400 });
  const fac = await db.facility.findUnique({ where: { id: facilityId } });
  if (!fac || fac.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  const item = await db.onCallSchedule.create({
    data: {
      organizationId: session.user.organizationId,
      staffId,
      facilityId,
      departmentId: departmentId || null,
      specialty,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      isPrimary: !!isPrimary,
      isBackup: !!isBackup,
      contactMethod,
      contactValue,
      escalationOrder: escalationOrder || 0,
      notes,
      status: "scheduled",
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId, action: "ON_CALL_CREATED", resourceType: "on_call_schedule", resourceId: item.id, newValues: { staffId, facilityId, startDate } });
  return NextResponse.json({ item }, { status: 201 });
}
