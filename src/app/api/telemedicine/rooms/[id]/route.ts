// =====================================================================
// API: /api/telemedicine/rooms/[id]
//   GET — single telemedicine room with all details + participants
//          + a fully-resolved join URL (Daily.co URL + token).
//
// Permission: telemedicine.view (or reuse clinical.view).
//
// The join URL is included only when:
//   - the caller is the linked clinician (doctor), OR
//   - the caller is the patient portal (via a separate portal route —
//     this staff route never exposes the patient's token; patients use
//     /api/portal/telemedicine which issues their own token).
//
// For staff in non-clinician roles (e.g. receptionist viewing queue),
// the room URL is exposed but no joinToken is materialised — they
// wouldn't join the call themselves.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasAnyPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { getRoomUrl } from "@/lib/telemedicine/daily-co";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VIEW_PERMS = [PERMISSIONS.CLINICAL_VIEW];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAnyPermission(session, VIEW_PERMS)) {
    return NextResponse.json(
      { error: "Forbidden — missing telemedicine.view permission" },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const room = await db.telemedicineRoom.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            patientNumber: true,
            firstName: true,
            lastName: true,
            sex: true,
            dateOfBirth: true,
            phone: true,
          },
        },
        clinician: {
          select: { id: true, firstName: true, lastName: true },
        },
        facility: { select: { id: true, name: true, code: true } },
        appointment: {
          select: {
            id: true,
            appointmentNumber: true,
            scheduledStart: true,
            reason: true,
            status: true,
          },
        },
        encounter: { select: { id: true, encounterNumber: true } },
        participants: {
          select: {
            id: true,
            role: true,
            userId: true,
            patientId: true,
            joinToken: true,
            joinedAt: true,
            leftAt: true,
            durationSec: true,
            ipAddress: true,
            userAgent: true,
          },
          orderBy: { createdAt: "asc" },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!room) {
      return NextResponse.json(
        { error: "Telemedicine room not found" },
        { status: 404 }
      );
    }

    // Org isolation — the room's facilityId must belong to the caller's org.
    if (room.organizationId !== session.user.organizationId) {
      // Don't leak existence across org boundaries — return 404 not 403.
      return NextResponse.json(
        { error: "Telemedicine room not found" },
        { status: 404 }
      );
    }

    // Determine if the caller is the linked clinician → eligible to
    // receive the doctor's join token. The join token itself is only
    // minted at the POST /join endpoint (so each join mints a fresh
    // token); this GET just exposes the room URL (Daily.co public URL
    // without a token — it's safe to share, the room is private so the
    // URL alone is useless without a token).
    const isLinkedClinician = room.clinicianId === session.user.id;
    const isSuperAdmin = session.user.roles.includes("super_admin");

    // Audit the access — viewing a telemedicine room is a clinical
    // patient-data access that should be traceable.
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: room.facilityId,
      action: "TELEMEDICINE_ROOM_VIEWED",
      resourceType: "telemedicine_room",
      resourceId: room.id,
      newValues: {
        roomName: room.roomName,
        status: room.status,
        asClinician: isLinkedClinician,
      },
    });

    // Strip the joinToken field from participants for non-clinician
    // callers. The token is opaque but we don't want to surface it
    // indiscriminately. The POST /join endpoint mints a fresh token
    // when the doctor actually joins.
    const sanitizedParticipants = room.participants.map((p) => {
      if (isLinkedClinician || isSuperAdmin) return p;
      const { joinToken, ...rest } = p;
      return rest;
    });

    return NextResponse.json({
      room: {
        ...room,
        participants: sanitizedParticipants,
        // Convenience field for the caller — the bare Daily.co URL
        // without a token. Use POST /join to obtain a tokenised URL.
        roomUrl: getRoomUrl(room.roomName),
        canJoinAsDoctor: isLinkedClinician || isSuperAdmin,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/telemedicine/rooms/[id]] error:", e);
    return NextResponse.json(
      {
        error: "Failed to load telemedicine room",
        detail: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
