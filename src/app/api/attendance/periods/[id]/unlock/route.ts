// API: /api/attendance/periods/[id]/unlock — POST (audited, requires reason)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_PERIOD_UNLOCK) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const period = await db.attendancePeriod.findUnique({ where: { id } });
  if (!period || period.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (period.status !== "locked") return NextResponse.json({ error: "Period is not locked." }, { status: 400 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  if (!body.reason) return NextResponse.json({ error: "A reason is required to unlock a period." }, { status: 400 });

  await db.$transaction(async (tx) => {
    await tx.staffAttendance.updateMany({
      where: { periodId: id },
      data: { isLocked: false, periodId: null },
    });
    await tx.attendancePeriod.update({
      where: { id },
      data: { status: "review", lockedAt: null, lockedById: null },
    });
  });

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_PERIOD_UNLOCKED", resourceType: "attendance_period", resourceId: id, reason: body.reason });
  return NextResponse.json({ item: { id, status: "review" } });
}
