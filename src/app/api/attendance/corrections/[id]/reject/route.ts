// API: /api/attendance/corrections/[id]/reject — POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ATTENDANCE_CORRECTION_APPROVE) && !hasPermission(session, PERMISSIONS.ATTENDANCE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.attendanceCorrection.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  // Transaction: reject correction + restore attendance status
  await db.$transaction(async (tx) => {
    await tx.attendanceCorrection.update({
      where: { id },
      data: { status: "rejected", reviewedById: session.user.id, reviewComment: body.comment || body.reason || null, reviewedAt: new Date() },
    });
    // Restore attendance status from correction_pending back to a sensible value
    if (existing.attendanceId) {
      const att = await tx.staffAttendance.findUnique({ where: { id: existing.attendanceId } });
      if (att && att.status === "correction_pending") {
        const newStatus = att.checkOutAt ? "checked_out" : (att.checkInAt ? "checked_in" : "absent");
        await tx.staffAttendance.update({ where: { id: att.id }, data: { status: newStatus } });
      }
    }
  });

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ATTENDANCE_CORRECTION_REJECTED", resourceType: "attendance_correction", resourceId: id, reason: body.comment || body.reason });
  return NextResponse.json({ item: { id, status: "rejected" } });
}
