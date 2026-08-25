// =====================================================================
// API: /api/admissions/[id]/assign-bed
//   POST — assign a bed to an approved admission (transitional: approved → bed_assigned)
//   Body: { wardId, roomId?, bedId }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_BED_ASSIGN) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden — missing admission.bed_assign permission" }, { status: 403 });
  }
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { wardId, roomId, bedId } = body;
  if (!wardId || !bedId) return NextResponse.json({ error: "wardId and bedId are required" }, { status: 400 });

  const existing = await db.admission.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Admission not found" }, { status: 404 });

  // Allow bed assignment from approved or awaiting_bed states
  if (!["approved", "awaiting_bed", "bed_assigned"].includes(existing.status)) {
    return NextResponse.json({ error: `Cannot assign bed to admission in status "${existing.status}"` }, { status: 400 });
  }

  // Verify bed exists, belongs to ward, and is available
  const bed = await db.bed.findUnique({ where: { id: bedId } });
  if (!bed || bed.wardId !== wardId) {
    return NextResponse.json({ error: "Bed not found or does not belong to the selected ward" }, { status: 400 });
  }
  if (bed.status !== "available") {
    return NextResponse.json({ error: `Bed is not available (current status: ${bed.status})` }, { status: 400 });
  }

  // Transaction: update admission status + create BedAssignment + mark bed occupied
  const result = await db.$transaction(async (tx) => {
    // Release any prior active bed assignment for this admission
    await tx.bedAssignment.updateMany({
      where: { admissionId: id, status: "active" },
      data: { status: "released", releasedAt: new Date() },
    });

    // Create new bed assignment
    const assignment = await tx.bedAssignment.create({
      data: {
        admissionId: id,
        patientId: existing.patientId,
        facilityId: existing.facilityId,
        wardId,
        roomId: roomId || null,
        bedId,
        assignedById: session.user.id,
        status: "active",
      },
    });

    // Mark bed as occupied (or reserved if patient hasn't arrived yet)
    await tx.bed.update({
      where: { id: bedId },
      data: { status: "reserved" }, // reserved until patient checks in
    });

    // Update admission status to bed_assigned
    const updated = await tx.admission.update({
      where: { id },
      data: { status: "bed_assigned", updatedById: session.user.id },
    });

    return { assignment, updated };
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "ADMISSION_BED_ASSIGNED",
    resourceType: "admission",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: { status: "bed_assigned", wardId, bedId },
  });

  return NextResponse.json({ item: result.updated, assignment: result.assignment });
}
