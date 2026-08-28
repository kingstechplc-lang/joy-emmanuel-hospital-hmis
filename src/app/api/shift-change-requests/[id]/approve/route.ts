// API: /api/shift-change-requests/[id]/approve — POST (approve + apply shift change)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_SWAP_APPROVE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.shiftChangeRequest.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "pending") return NextResponse.json({ error: `Cannot approve a request in status '${existing.status}'.` }, { status: 400 });
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}

  // Transaction: update request + apply shift change
  await db.$transaction(async (tx) => {
    await tx.shiftChangeRequest.update({
      where: { id },
      data: {
        status: "approved",
        reviewedById: session.user.id,
        reviewComment: body.comment || null,
      },
    });

    // If originalShiftId provided, update that shift
    if (existing.originalShiftId) {
      const updateData: any = {};
      if (existing.requestedShiftDate) updateData.shiftDate = existing.requestedShiftDate;
      if (existing.requestedStartTime) updateData.startTime = existing.requestedStartTime;
      if (existing.requestedEndTime) updateData.endTime = existing.requestedEndTime;
      if (existing.requestedShiftType) updateData.shiftType = existing.requestedShiftType;
      if (Object.keys(updateData).length > 0) {
        await tx.staffShift.update({ where: { id: existing.originalShiftId }, data: updateData });
      }
    } else if (existing.requestedShiftDate && existing.requestedStartTime) {
      // Create a new shift if no original
      const staff = await tx.staff.findUnique({ where: { id: existing.staffId } });
      if (staff?.facilityId) {
        await tx.staffShift.create({
          data: {
            staffId: existing.staffId,
            facilityId: staff.facilityId,
            shiftDate: existing.requestedShiftDate,
            startTime: existing.requestedStartTime,
            endTime: existing.requestedEndTime,
            shiftType: existing.requestedShiftType || "morning",
            status: "scheduled",
          },
        });
      }
    }
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SHIFT_CHANGE_APPROVED",
    resourceType: "shift_change_request",
    resourceId: id,
    reason: body.comment,
  });

  return NextResponse.json({ item: { id, status: "approved" } });
}
