// API: /api/attendance/events — GET (list raw attendance events)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_VIEW) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const staffId = url.searchParams.get("staffId");
  const facilityId = url.searchParams.get("facilityId");
  const processingStatus = url.searchParams.get("processingStatus");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const where: any = { organizationId: session.user.organizationId };
  if (staffId) where.staffId = staffId;
  if (facilityId) where.facilityId = facilityId;
  if (processingStatus) where.processingStatus = processingStatus;
  if (dateFrom || dateTo) {
    where.timestamp = {};
    if (dateFrom) where.timestamp.gte = new Date(dateFrom);
    if (dateTo) where.timestamp.lte = new Date(dateTo);
  }
  const items = await db.attendanceEvent.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: 500,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true } },
      facility: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ items, count: items.length });
}
