// API: /api/attendance/exceptions — GET (list) + POST (create manual exception)
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
  const staffId = url.searchParams.get("staffId");
  const facilityId = url.searchParams.get("facilityId");
  const exceptionType = url.searchParams.get("exceptionType");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const where: any = { organizationId: session.user.organizationId };
  if (status) where.status = status;
  if (staffId) where.staffId = staffId;
  if (facilityId) where.facilityId = facilityId;
  if (exceptionType) where.exceptionType = exceptionType;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) where.date.lte = new Date(dateTo);
  }
  const items = await db.attendanceException.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
      facility: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, firstName: true, lastName: true } },
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
  const { staffId, facilityId, departmentId, attendanceId, date, exceptionType, severity, description, metadata } = body;
  if (!staffId || !facilityId || !date || !exceptionType || !description) return NextResponse.json({ error: "staffId, facilityId, date, exceptionType, description are required" }, { status: 400 });
  const item = await db.attendanceException.create({
    data: {
      organizationId: session.user.organizationId,
      staffId, facilityId,
      departmentId: departmentId || null,
      attendanceId: attendanceId || null,
      date: new Date(date),
      exceptionType,
      severity: severity || "warning",
      description,
      metadata: metadata ? JSON.stringify(metadata) : null,
      status: "open",
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId, action: "ATTENDANCE_EXCEPTION_CREATED", resourceType: "attendance_exception", resourceId: item.id, newValues: { staffId, exceptionType, description } });
  return NextResponse.json({ item }, { status: 201 });
}
