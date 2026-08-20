// =====================================================================
// API: /api/beds/[id]
//   GET   — single bed with current assignment
//   PATCH — status transition (transactional)
//           body: { status: "available"|"occupied"|"reserved"|"cleaning"|"maintenance"|"out_of_service", notes? }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_STATUSES = ["available", "occupied", "reserved", "cleaning", "maintenance", "out_of_service"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW) && !hasPermission(session, PERMISSIONS.BED_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const bed = await db.bed.findUnique({
    where: { id },
    include: {
      ward: { select: { id: true, name: true, code: true, wardType: true } },
      room: { select: { id: true, roomNumber: true, roomType: true } },
      bedAssignments: {
        where: { status: "active" },
        take: 1,
        include: {
          patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true, phone: true, bloodGroup: true } },
          admission: {
            select: {
              id: true, admissionNumber: true, admissionType: true, admissionDiagnosis: true,
              admittedAt: true, status: true,
              admittedBy: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  if (!bed) return NextResponse.json({ error: "Bed not found" }, { status: 404 });
  return NextResponse.json({ item: bed });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BED_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const { status, notes } = body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  try {
    // Use a transaction to atomically check + update (prevents race conditions / double-booking)
    const updated = await db.$transaction(async (tx) => {
      const current = await tx.bed.findUnique({ where: { id } });
      if (!current) throw new Error("Bed not found");

      // Disallow releasing an occupied bed via this endpoint — use /release instead
      if (current.status === "occupied" && status === "available") {
        throw new Error("Cannot directly mark an occupied bed as available. Use the /release endpoint to release the active assignment.");
      }
      // Disallow marking an available bed as occupied directly — use /assign
      if (current.status === "available" && status === "occupied") {
        throw new Error("Cannot directly mark an available bed as occupied. Use the /assign endpoint to assign a patient.");
      }

      return await tx.bed.update({
        where: { id },
        data: { status, ...(notes !== undefined ? { notes } : {}) },
      });
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: updated.facilityId,
      action: "BED_STATUS_CHANGED",
      resourceType: "bed",
      resourceId: id,
      newValues: { status, notes },
    });

    return NextResponse.json({ item: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to update bed" }, { status: 400 });
  }
}
