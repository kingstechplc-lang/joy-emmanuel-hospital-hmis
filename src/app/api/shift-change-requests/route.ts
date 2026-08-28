// API: /api/shift-change-requests — GET (list) + POST (create)
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
  const status = url.searchParams.get("status");
  const where: any = { organizationId: session.user.organizationId };
  if (staffId) where.staffId = staffId;
  if (status) where.status = status;
  const items = await db.shiftChangeRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
      originalShift: { include: { facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } } },
      reviewedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_SWAP_REQUEST) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { staffId, originalShiftId, requestedShiftDate, requestedShiftType, requestedStartTime, requestedEndTime, reasonCode, reason } = body;
  if (!staffId) return NextResponse.json({ error: "staffId is required" }, { status: 400 });
  const staff = await db.staff.findUnique({ where: { id: staffId }, include: { user: { select: { organizationId: true } } } });
  if (!staff || staff.user.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Invalid staff" }, { status: 400 });
  const item = await db.shiftChangeRequest.create({
    data: {
      organizationId: session.user.organizationId,
      staffId,
      originalShiftId: originalShiftId || null,
      requestedShiftDate: requestedShiftDate ? new Date(requestedShiftDate) : null,
      requestedShiftType,
      requestedStartTime: requestedStartTime ? new Date(requestedStartTime) : null,
      requestedEndTime: requestedEndTime ? new Date(requestedEndTime) : null,
      reasonCode,
      reason,
      status: "pending",
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "SHIFT_CHANGE_REQUESTED", resourceType: "shift_change_request", resourceId: item.id, newValues: { staffId, originalShiftId, requestedShiftDate } });
  return NextResponse.json({ item }, { status: 201 });
}
