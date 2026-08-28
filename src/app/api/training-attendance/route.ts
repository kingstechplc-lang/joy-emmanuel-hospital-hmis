// API: /api/training-attendance — GET (list) + POST (record/check-in)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_VIEW) && !hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const staffId = url.searchParams.get("staffId");
  const status = url.searchParams.get("status");
  const where: any = { organizationId: session.user.organizationId };
  if (sessionId) where.sessionId = sessionId;
  if (staffId) where.staffId = staffId;
  if (status) where.status = status;
  const items = await db.trainingAttendance.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
      session: { select: { id: true, sessionDate: true, startTime: true, endTime: true, program: { select: { id: true, title: true } } } },
      enrollment: { select: { id: true, status: true } },
    },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_ATTENDANCE_RECORD) && !hasPermission(session, PERMISSIONS.TRAINING_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { enrollmentId, staffId, sessionId, checkInAt, checkOutAt, status, notes } = body;
  if (!enrollmentId || !staffId) return NextResponse.json({ error: "enrollmentId, staffId are required" }, { status: 400 });

  // Calculate attended minutes if both check-in and check-out
  let attendedMinutes: number | null = null;
  let attendancePercentage: number | null = null;
  if (checkInAt && checkOutAt) {
    const inDate = new Date(checkInAt);
    const outDate = new Date(checkOutAt);
    attendedMinutes = Math.floor((outDate.getTime() - inDate.getTime()) / (1000 * 60));
    // Calculate percentage if session has end time
    if (sessionId) {
      const sess = await db.trainingSession.findUnique({ where: { id: sessionId } });
      if (sess?.startTime && sess?.endTime) {
        const totalMinutes = Math.floor((sess.endTime.getTime() - sess.startTime.getTime()) / (1000 * 60));
        if (totalMinutes > 0) attendancePercentage = Math.min(100, Math.round((attendedMinutes / totalMinutes) * 100));
      }
    }
  }

  // Upsert — one attendance per enrollment
  const item = await db.trainingAttendance.upsert({
    where: { enrollmentId },
    update: {
      checkInAt: checkInAt ? new Date(checkInAt) : undefined,
      checkOutAt: checkOutAt ? new Date(checkOutAt) : undefined,
      attendedMinutes,
      attendancePercentage,
      status: status || undefined,
      notes,
      recordedById: session.user.id,
    },
    create: {
      organizationId: session.user.organizationId,
      enrollmentId,
      staffId,
      sessionId: sessionId || null,
      checkInAt: checkInAt ? new Date(checkInAt) : null,
      checkOutAt: checkOutAt ? new Date(checkOutAt) : null,
      attendedMinutes,
      attendancePercentage,
      status: status || "present",
      notes,
      recordedById: session.user.id,
    },
  });

  // Update enrollment status based on attendance
  if (status === "present" || status === "late" || status === "partial") {
    await db.trainingEnrollment.update({ where: { id: enrollmentId }, data: { status: "attended" } }).catch(() => {});
  } else if (status === "absent") {
    await db.trainingEnrollment.update({ where: { id: enrollmentId }, data: { status: "absent" } }).catch(() => {});
  }

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "TRAINING_ATTENDANCE_RECORDED", resourceType: "training_attendance", resourceId: item.id, newValues: { enrollmentId, status, attendedMinutes } });
  return NextResponse.json({ item }, { status: 201 });
}
