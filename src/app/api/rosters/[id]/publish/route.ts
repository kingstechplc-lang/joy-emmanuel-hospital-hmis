// =====================================================================
// API: /api/rosters/[id]/publish — POST (publish a roster)
//   Workflow: draft → review → approved → published
//   Publishes the roster and notifies affected staff.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { sendWorkflowNotification } from "@/lib/workflow-notifications";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ROSTER_PUBLISH) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.roster.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.status === "published") {
    return NextResponse.json({ error: "Roster is already published." }, { status: 400 });
  }
  if (existing.lockedAt) {
    return NextResponse.json({ error: "Roster is locked. Unlock it first." }, { status: 400 });
  }

  let body: any = {};
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {}

  // Create new version snapshot before publishing
  const shifts = await db.staffShift.findMany({
    where: { rosterId: id },
    select: { id: true, staffId: true, shiftDate: true, startTime: true, endTime: true, shiftType: true, status: true },
  });
  const newVersion = existing.versionNumber + 1;

  // Use transaction: update roster + create version + audit
  await db.$transaction(async (tx) => {
    await tx.roster.update({
      where: { id },
      data: {
        status: "published",
        publishedAt: new Date(),
        publishedById: session.user.id,
        versionNumber: newVersion,
      },
    });

    await tx.rosterVersion.create({
      data: {
        rosterId: id,
        versionNumber: newVersion,
        snapshot: JSON.stringify({ assignments: shifts, publishedAt: new Date().toISOString() }),
        changedById: session.user.id,
        changeReason: body.reason || "Published",
      },
    });
  });

  // Send notifications to affected staff
  try {
    const staffIds = [...new Set(shifts.map((s) => s.staffId))];
    for (const staffId of staffIds) {
      const staff = await db.staff.findUnique({
        where: { id: staffId },
        select: { userId: true, firstName: true, lastName: true },
      });
      if (staff) {
        await db.notification.create({
          data: {
            userId: staff.userId,
            facilityId: existing.facilityId,
            type: "roster_published",
            title: "Roster Published",
            message: `A new roster "${existing.name}" has been published. Check your upcoming shifts.`,
            referenceType: "roster",
            referenceId: id,
          },
        });
      }
    }
  } catch (e) {
    console.error("Notification failed (non-fatal):", e);
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "ROSTER_PUBLISHED",
    resourceType: "roster",
    resourceId: id,
    oldValues: { status: existing.status, versionNumber: existing.versionNumber },
    newValues: { status: "published", versionNumber: newVersion },
    reason: body.reason,
  });

  return NextResponse.json({ item: { id, status: "published", versionNumber: newVersion } });
}
