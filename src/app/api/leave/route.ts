// =====================================================================
// API: /api/leave
//   GET  — list leave records (filter by staff, status, type)
//   POST — create leave record
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const staffId = url.searchParams.get("staffId");
  const status = url.searchParams.get("status");
  const leaveType = url.searchParams.get("leaveType");

  // Scope to user's org
  const orgUsers = await db.user.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const userIds = orgUsers.map((u) => u.id);
  const orgStaff = await db.staff.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const staffIds = orgStaff.map((s) => s.id);

  const where: any = { staffId: { in: staffIds } };
  if (staffId) where.staffId = staffId;
  if (status) where.status = status;
  if (leaveType) where.leaveType = leaveType;

  const leaves = await db.leaveRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
    },
  });

  const items = leaves.map((l) => ({
    id: l.id,
    staffId: l.staffId,
    staff: l.staff,
    leaveType: l.leaveType,
    startDate: l.startDate,
    endDate: l.endDate,
    reason: l.reason,
    status: l.status,
    approvedById: l.approvedById,
    createdAt: l.createdAt,
  }));

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE) && !hasPermission(session, PERMISSIONS.STAFF_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { staffId, leaveType, startDate, endDate, reason } = body;

  if (!staffId || !startDate) {
    return NextResponse.json({ error: "staffId, startDate are required" }, { status: 400 });
  }

  const staff = await db.staff.findUnique({
    where: { id: staffId },
    include: { user: { select: { organizationId: true } } },
  });
  if (!staff || staff.user.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid staff member" }, { status: 400 });
  }

  const leave = await db.leaveRecord.create({
    data: {
      staffId,
      leaveType: leaveType || "annual",
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      reason: reason || null,
      status: "pending",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: session.user.facilityId || undefined,
    action: "LEAVE_REQUESTED",
    resourceType: "leave_record",
    resourceId: leave.id,
    newValues: { staffId, leaveType, startDate, endDate, reason },
  });

  return NextResponse.json({ item: leave }, { status: 201 });
}
