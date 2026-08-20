// =====================================================================
// API: /api/beds/[id]/assign
//   POST — assign bed to an admission (transactional, prevents double-booking)
//          body: { admissionId, patientId, wardId, roomId?, assignedById? }
//          Sets bed.status='occupied', creates active BedAssignment
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
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { admissionId, patientId, wardId, roomId, assignedById } = body;

  if (!admissionId || !patientId || !wardId) {
    return NextResponse.json({ error: "admissionId, patientId, wardId are required" }, { status: 400 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Lock the bed row + verify it's available (SELECT FOR UPDATE semantics)
      const bed = await tx.bed.findUnique({ where: { id: bedId } });
      if (!bed) throw new Error("Bed not found");
      if (bed.status === "occupied") throw new Error("Bed is already occupied");
      if (bed.status === "maintenance") throw new Error("Bed is under maintenance");
      if (bed.status === "out_of_service") throw new Error("Bed is out of service");

      // 2. Verify admission exists + belongs to patient
      const admission = await tx.admission.findUnique({ where: { id: admissionId } });
      if (!admission) throw new Error("Admission not found");
      if (admission.patientId !== patientId) throw new Error("Patient does not match the admission");
      if (admission.status !== "admitted") throw new Error(`Admission status is ${admission.status}; only admitted patients can be assigned beds`);

      // 3. Release any prior active bed assignments for this admission (one active bed per admission)
      const priorAssignments = await tx.bedAssignment.findMany({
        where: { admissionId, status: "active" },
      });
      for (const pa of priorAssignments) {
        await tx.bedAssignment.update({
          where: { id: pa.id },
          data: { status: "released", releasedAt: new Date() },
        });
        // Free the old bed if no other active assignment
        const stillAssigned = await tx.bedAssignment.count({
          where: { bedId: pa.bedId, status: "active" },
        });
        if (stillAssigned === 0) {
          await tx.bed.update({
            where: { id: pa.bedId },
            data: { status: "available" },
          });
        }
      }

      // 4. Mark the new bed occupied
      await tx.bed.update({
        where: { id: bedId },
        data: { status: "occupied" },
      });

      // 5. Create the new active assignment
      const assignment = await tx.bedAssignment.create({
        data: {
          admissionId,
          patientId,
          facilityId: bed.facilityId,
          wardId,
          roomId: roomId || bed.roomId || null,
          bedId,
          assignedAt: new Date(),
          assignedById: assignedById || session.user.id,
          status: "active",
        },
      });

      return assignment;
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: result.facilityId,
      action: "BED_ASSIGNED",
      resourceType: "bed_assignment",
      resourceId: result.id,
      newValues: { bedId, admissionId, patientId, wardId },
    });

    return NextResponse.json({ item: result }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to assign bed" }, { status: 400 });
  }
}
