// API: /api/leave-balances — GET (list staff balances)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const staffId = url.searchParams.get("staffId");
  const leaveTypeId = url.searchParams.get("leaveTypeId");
  const leaveYear = url.searchParams.get("leaveYear") || String(new Date().getFullYear());

  const orgStaff = await db.staff.findMany({
    where: { user: { organizationId: session.user.organizationId } },
    select: { id: true },
  });
  const orgStaffIds = orgStaff.map((s) => s.id);

  const where: any = { organizationId: session.user.organizationId, leaveYear, staffId: { in: orgStaffIds } };
  if (staffId) where.staffId = staffId;
  if (leaveTypeId) where.leaveTypeId = leaveTypeId;

  const items = await db.leaveBalance.findMany({
    where,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
      leaveType: { select: { id: true, name: true, code: true, colorHex: true } },
    },
    orderBy: [{ staff: { lastName: "asc" } }, { leaveType: { name: "asc" } }],
  });
  return NextResponse.json({ items, count: items.length, leaveYear });
}
