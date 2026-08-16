// =====================================================================
// API: /api/beds/[id]/release
//   POST — release the current active assignment for a bed
//          Sets bed_assignment.status='released', releasedAt=now,
//          bed.status='available' (or 'cleaning' if ?cleaning=true)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BED_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: bedId } = await params;
  const url = new URL(req.url);
  const setStatus = url.searchParams.get("cleaning") === "true" ? "cleaning" : "available";

  try {
    const result = await db.$transaction(async (tx) => {
      const bed = await tx.bed.findUnique({ where: { id: bedId } });
      if (!bed) throw new Error("Bed not found");
      if (bed.status !== "occupied") {
        throw new Error(`Bed is not currently occupied (status: ${bed.status})`);
      }

      // Find the active assignment
      const active = await tx.bedAssignment.findFirst({
        where: { bedId, status: "active" },
      });
      if (!active) {
        // No active assignment — just free the bed
        await tx.bed.update({ where: { id: bedId }, data: { status: setStatus } });
        return null;
      }

      // Release the assignment
      await tx.bedAssignment.update({
        where: { id: active.id },
        data: { status: "released", releasedAt: new Date() },
      });

      // Free the bed
      await tx.bed.update({
        where: { id: bedId },
        data: { status: setStatus },
      });

      return active;
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: (await db.bed.findUnique({ where: { id: bedId } }))?.facilityId || undefined,
      action: "BED_RELEASED",
      resourceType: "bed",
      resourceId: bedId,
      newValues: { newStatus: setStatus, releasedAssignmentId: result?.id || null },
    });

    return NextResponse.json({ item: { bedId, status: setStatus, released: !!result } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to release bed" }, { status: 400 });
  }
}
