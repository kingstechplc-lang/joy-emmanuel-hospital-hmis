// =====================================================================
// API: /api/telemedicine/rooms/[id]/end
//   POST — doctor ends the call → status="ended".
//
// Permission: doctor only (linked clinician or super_admin).
//
// State machine:
//   - From status "in_progress" → "ended" (happy path)
//   - From status "patient_waiting" → "ended" (doctor can end early if
//     the patient never joined — e.g. no-show)
//   - From status "ended"        → 200 idempotent
//   - From status "created"      → 400 (no call to end — should cancel
//                                  the room instead, or use this
//                                  endpoint which will reject)
//
// Sets callEndedAt + callDurationSec (computed from callStartedAt).
// Calls Daily.co endRoom() to expire the room server-side.
//
// Audit logs TELEMEDICINE_CALL_ENDED.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasAnyPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { endRoom as endDailyRoom } from "@/lib/telemedicine/daily-co";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const END_PERMS = [PERMISSIONS.CLINICAL_CREATE];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAnyPermission(session, END_PERMS)) {
    return NextResponse.json(
      { error: "Forbidden — missing telemedicine.end permission" },
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
        callStartedAt: true,
        callEndedAt: true,
        callDurationSec: true,
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

    const isLinkedClinician = room.clinicianId === session.user.id;
    const isSuperAdmin = session.user.roles.includes("super_admin");
    if (!isLinkedClinician && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Only the linked clinician can end this telemedicine call." },
        { status: 403 }
      );
    }

    // Idempotent — already ended.
    if (room.status === "ended") {
      return NextResponse.json({
        room: {
          id: room.id,
          status: room.status,
          callEndedAt: room.callEndedAt,
          callDurationSec: room.callDurationSec,
        },
        message: "Call has already ended",
      });
    }

    // Reject ending a room that never started (no callStartedAt).
    if (room.status === "created") {
      return NextResponse.json(
        {
          error:
            "Cannot end a telemedicine room that has not started. Use the cancel action instead.",
          currentStatus: room.status,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    // Duration: time from callStartedAt to now, in seconds.
    const durationSec = room.callStartedAt
      ? Math.max(
          0,
          Math.floor((now.getTime() - room.callStartedAt.getTime()) / 1000)
        )
      : 0;

    // 1. Update the room record.
    const updated = await db.telemedicineRoom.update({
      where: { id: room.id },
      data: {
        callEndedAt: now,
        callDurationSec: durationSec,
        status: "ended",
      },
    });

    // 2. Mark all still-joined participants as left.
    await db.telemedicineParticipant.updateMany({
      where: {
        roomId: room.id,
        leftAt: null,
        joinedAt: { not: null },
      },
      data: { leftAt: now },
    });

    // 3. Expire the Daily.co room (best-effort — don't fail the API
    // call if Daily.co itself is down). Log the failure for ops review.
    let dailyEndOk = true;
    let dailyEndError: string | null = null;
    try {
      await endDailyRoom(room.roomName);
    } catch (e: any) {
      dailyEndOk = false;
      dailyEndError = e?.message || String(e);
      console.error(
        `[telemedicine/end] Daily.co endRoom failed for ${room.roomName}:`,
        e
      );
    }

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: room.facilityId,
      action: "TELEMEDICINE_CALL_ENDED",
      resourceType: "telemedicine_room",
      resourceId: room.id,
      oldValues: { status: room.status, callStartedAt: room.callStartedAt },
      newValues: {
        status: "ended",
        callEndedAt: now,
        callDurationSec: durationSec,
        dailyEndOk,
        dailyEndError,
      },
    });

    return NextResponse.json({
      room: updated,
      daily: { ok: dailyEndOk, error: dailyEndError },
    });
  } catch (e: any) {
    console.error("[POST /api/telemedicine/rooms/[id]/end] error:", e);
    return NextResponse.json(
      {
        error: "Failed to end telemedicine call",
        detail: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
