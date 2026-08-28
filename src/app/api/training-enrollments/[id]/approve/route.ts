// API: /api/training-enrollments/[id]/approve — POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_APPROVE) && !hasPermission(session, PERMISSIONS.TRAINING_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.trainingEnrollment.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "pending") return NextResponse.json({ error: `Cannot approve enrollment in status '${existing.status}'.` }, { status: 400 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  // Check session capacity if session is set
  if (existing.sessionId) {
    const session2 = await db.trainingSession.findUnique({ where: { id: existing.sessionId }, include: { _count: { select: { enrollments: true } } } });
    if (session2?.maxCapacity && session2._count.enrollments >= session2.maxCapacity) {
      // Auto-waitlist
      const updated = await db.trainingEnrollment.update({
        where: { id },
        data: { status: "waitlisted", approvedById: session.user.id, approvedAt: new Date(), notes: body.comment || "Auto-waitlisted (session full)" },
      });
      await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "TRAINING_ENROLLMENT_WAITLISTED", resourceType: "training_enrollment", resourceId: id, reason: "Session full" });
      return NextResponse.json({ item: updated, message: "Session full — enrollment waitlisted." });
    }
  }

  const updated = await db.trainingEnrollment.update({
    where: { id },
    data: { status: "approved", approvedById: session.user.id, approvedAt: new Date(), notes: body.comment || existing.notes },
  });

  // Notify staff
  try {
    const staff = await db.staff.findUnique({ where: { id: existing.staffId }, select: { userId: true, firstName: true, lastName: true } });
    if (staff) {
      await db.notification.create({
        data: {
          userId: staff.userId,
          type: "training_enrollment_approved",
          title: "Training Enrollment Approved",
          message: `Your training enrollment has been approved.`,
          referenceType: "training_enrollment",
          referenceId: id,
        },
      });
    }
  } catch (e) { console.error("Notification failed (non-fatal):", e); }

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "TRAINING_ENROLLMENT_APPROVED", resourceType: "training_enrollment", resourceId: id, reason: body.comment });
  return NextResponse.json({ item: updated });
}
