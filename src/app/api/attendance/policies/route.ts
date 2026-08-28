// API: /api/attendance/policies — GET (list) + POST (create)
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
  const facilityId = url.searchParams.get("facilityId");
  const where: any = { organizationId: session.user.organizationId, active: true };
  if (facilityId) where.OR = [{ facilityId: null }, { facilityId }];
  const items = await db.attendancePolicy.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_POLICY_MANAGE) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, facilityId, departmentId, gracePeriodMinutes, lateThresholdMinutes, earlyDepartureThresholdMinutes, maxDailyHours, overtimeThresholdMinutes, minRestHours, breakDurationMinutes, paidBreaks, roundingMinutes, roundingMode, missingCheckoutAction, autoCheckoutTime, absenceProcessingEnabled, absenceProcessingDelayMinutes, nightStartHour, nightEndHour, weekendStartDay, notes } = body;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const item = await db.attendancePolicy.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null,
      departmentId: departmentId || null,
      name,
      gracePeriodMinutes: gracePeriodMinutes ?? 10,
      lateThresholdMinutes: lateThresholdMinutes ?? 0,
      earlyDepartureThresholdMinutes: earlyDepartureThresholdMinutes ?? 15,
      maxDailyHours: maxDailyHours ?? 13,
      overtimeThresholdMinutes: overtimeThresholdMinutes ?? 480,
      minRestHours: minRestHours ?? 11,
      breakDurationMinutes: breakDurationMinutes ?? 30,
      paidBreaks: paidBreaks ?? true,
      roundingMinutes: roundingMinutes ?? 0,
      roundingMode: roundingMode || "nearest",
      missingCheckoutAction: missingCheckoutAction || "flag",
      autoCheckoutTime: autoCheckoutTime || null,
      absenceProcessingEnabled: absenceProcessingEnabled ?? true,
      absenceProcessingDelayMinutes: absenceProcessingDelayMinutes ?? 120,
      nightStartHour: nightStartHour ?? 19,
      nightEndHour: nightEndHour ?? 7,
      weekendStartDay: weekendStartDay ?? 6,
      notes,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_POLICY_CREATED", resourceType: "attendance_policy", resourceId: item.id, newValues: { name } });
  return NextResponse.json({ item }, { status: 201 });
}
