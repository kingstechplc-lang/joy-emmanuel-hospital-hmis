// =====================================================================
// API: /api/telemedicine/rooms/[id]/admit
//   POST — doctor admits the waiting patient → status="in_progress".
//
// Permission: doctor only (the linked clinician or any doctor —
// i.e. the caller must have CLINICAL_CREATE perms AND be the linked
// clinician or a super_admin).
//
// State transitions enforced here:
//   - From status "patient_waiting" → "in_progress"  (happy path)
//   - From status "created"          → 400 (patient must join first)
//   - From status "in_progress"      → 200 idempotent (no-op)
//   - From status "ended"            → 400 (call already ended)
//
// Sets admittedAt + callStartedAt.
//
// Audit logs TELEMEDICINE_CALL_STARTED.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasAnyPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const ADMIT_PERMS = [PERMISSIONS.CLINICAL_CREATE];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAnyPermission(session, ADMIT_PERMS)) {
    return NextResponse.json(
      { error: "Forbidden — missing telemedicine.admit permission" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const room = await db.telemedicineRoom.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        facilityId: true,
        clinicianId: true,
        status: true,
        roomName: true,
        patientId: true,
        patientJoinedAt: true,
        patientWaitingAt: true,
        admittedAt: true,
        callStartedAt: true,
      },
    });

    if (!room) {
      return NextResponse.json(
        { error: "Telemedicine room not found" },
        { status: 404 }
      );
    }
    if (room.organizationId !== session.user.organizationId) {
      return NextResponse.json(
        { error: "Telemedicine room not found" },
        { status: 404 }
      );
    }

    // Authorization: only the linked clinician (or super_admin) can
    // admit the patient.
    const isLinkedClinician = room.clinicianId === session.user.id;
    const isSuperAdmin = session.user.roles.includes("super_admin");
    if (!isLinkedClinician && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Only the linked clinician can admit the patient." },
        { status: 403 }
      );
    }

    // State machine enforcement.
    if (room.status === "ended") {
      return NextResponse.json(
        { error: "This telemedicine call has already ended." },
        { status: 400 }
      );
    }
    if (room.status === "created") {
      return NextResponse.json(
        {
          error:
            "Patient has not joined the waiting room yet. Wait for patient_waiting status before admitting.",
          currentStatus: room.status,
        },
        { status: 400 }
      );
    }
    if (room.status === "in_progress") {
      // Idempotent — already admitted. Return the current state.
      return NextResponse.json({
        room: {
          id: room.id,
          status: room.status,
          admittedAt: room.admittedAt,
          callStartedAt: room.callStartedAt,
        },
        message: "Call is already in progress",
      });
    }

    // Happy path: status === "patient_waiting" → "in_progress".
    const now = new Date();
    const updated = await db.telemedicineRoom.update({
      where: { id: room.id },
      data: {
        admittedAt: room.admittedAt || now,
        callStartedAt: room.callStartedAt || now,
        status: "in_progress",
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: room.facilityId,
      action: "TELEMEDICINE_CALL_STARTED",
      resourceType: "telemedicine_room",
      resourceId: room.id,
      oldValues: { status: room.status },
      newValues: {
        status: "in_progress",
        admittedAt: updated.admittedAt,
        callStartedAt: updated.callStartedAt,
      },
    });

    return NextResponse.json({ room: updated });
  } catch (e: any) {
    console.error("[POST /api/telemedicine/rooms/[id]/admit] error:", e);
    return NextResponse.json(
      {
        error: "Failed to admit patient",
        detail: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
