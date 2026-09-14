// =====================================================================
// API: /api/telemedicine/rooms/[id]/join
//   POST — record that the caller is joining the room; mint a Daily.co
//          meeting token for them; return the join URL + token.
//
// Body: { as: "doctor" | "patient" }
//
// Permission: telemedicine.view (staff only — patients use the portal
// JWT endpoint at /api/portal/telemedicine, not this staff route).
//
// State machine:
//   as="patient":
//     - Sets patientJoinedAt + patientWaitingAt + status="patient_waiting"
//     - Updates the patient participant row: joinedAt = now
//     - Mints a non-owner meeting token (patient can't admit others)
//   as="doctor":
//     - Updates/creates the doctor participant row: joinedAt = now
//     - Mints an OWNER meeting token (doctor can end call, admit, remove)
//
// Returns: { roomUrl, joinToken, dev } where dev=true if Daily.co
// wasn't configured (so the iframe can show a placeholder instead).
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getSession,
  hasAnyPermission,
  auditLog,
  getClientIp,
  getUserAgent,
} from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  createMeetingToken,
  getRoomUrl,
  isDailyConfigured,
} from "@/lib/telemedicine/daily-co";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VIEW_PERMS = [PERMISSIONS.CLINICAL_VIEW];

export async function POST(
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

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 }
    );
  }

  const role = body?.as;
  if (!role || !["doctor", "patient"].includes(role)) {
    return NextResponse.json(
      { error: "Body must include { as: 'doctor' | 'patient' }" },
      { status: 400 }
    );
  }

  try {
    const room = await db.telemedicineRoom.findUnique({
      where: { id },
      include: {
        participants: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        clinician: {
          select: { id: true, firstName: true, lastName: true },
        },
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

    // If the room has ended, no further joins.
    if (room.status === "ended") {
      return NextResponse.json(
        { error: "This telemedicine call has already ended." },
        { status: 400 }
      );
    }

    // ── Doctor join ─────────────────────────────────────────────────
    // Only the linked clinician (or a super_admin) may join as doctor.
    if (role === "doctor") {
      const isLinkedClinician = room.clinicianId === session.user.id;
      const isSuperAdmin = session.user.roles.includes("super_admin");
      if (!isLinkedClinician && !isSuperAdmin) {
        return NextResponse.json(
          {
            error:
              "Only the linked clinician can join this telemedicine room as a doctor.",
          },
          { status: 403 }
        );
      }

      // Mint the owner meeting token. We don't persist it server-side
      // beyond the participant row — the iframe consumes it directly.
      let token: string;
      try {
        const displayName =
          room.clinician?.firstName && room.clinician?.lastName
            ? `Dr. ${room.clinician.firstName} ${room.clinician.lastName}`
            : session.user.name || "Clinician";
        token = await createMeetingToken(room.roomName, true, displayName);
      } catch (e: any) {
        console.error("[telemedicine/join/doctor] token mint failed:", e);
        return NextResponse.json(
          {
            error: "Failed to mint Daily.co meeting token",
            detail: e?.message || String(e),
          },
          { status: 502 }
        );
      }

      // Update or create the doctor participant row.
      const doctorParticipant =
        room.participants.find(
          (p) => p.role === "doctor" && p.userId === session.user.id
        ) ||
        room.participants.find((p) => p.role === "doctor");
      const now = new Date();
      const ip = getClientIp(req);
      const ua = getUserAgent(req);

      if (doctorParticipant) {
        await db.telemedicineParticipant.update({
          where: { id: doctorParticipant.id },
          data: {
            userId: session.user.id,
            joinToken: token,
            joinedAt: doctorParticipant.joinedAt || now,
            leftAt: null,
            ipAddress: ip,
            userAgent: ua,
          },
        });
      } else {
        await db.telemedicineParticipant.create({
          data: {
            roomId: room.id,
            userId: session.user.id,
            patientId: null,
            role: "doctor",
            joinToken: token,
            joinedAt: now,
            ipAddress: ip,
            userAgent: ua,
          },
        });
      }

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: room.facilityId,
        action: "TELEMEDICINE_DOCTOR_JOINED",
        resourceType: "telemedicine_room",
        resourceId: room.id,
        newValues: {
          roomName: room.roomName,
          role: "doctor",
          isOwner: true,
        },
      });

      return NextResponse.json({
        roomUrl: getRoomUrl(room.roomName, token),
        joinToken: token,
        dev: !isDailyConfigured(),
      });
    }

    // ── Patient join ────────────────────────────────────────────────
    // For staff-initiated "patient is joining" notifications (e.g. the
    // receptionist confirms the patient clicked the link). The patient
    // themselves join via the portal endpoint at /api/portal/telemedicine.
    if (role === "patient") {
      let token: string;
      try {
        const displayName =
          room.patient?.firstName && room.patient?.lastName
            ? `${room.patient.firstName} ${room.patient.lastName}`
            : "Patient";
        token = await createMeetingToken(room.roomName, false, displayName);
      } catch (e: any) {
        console.error("[telemedicine/join/patient] token mint failed:", e);
        return NextResponse.json(
          {
            error: "Failed to mint Daily.co meeting token",
            detail: e?.message || String(e),
          },
          { status: 502 }
        );
      }

      const now = new Date();
      const ip = getClientIp(req);
      const ua = getUserAgent(req);

      // Update the patient participant row.
      const patientParticipant = room.participants.find(
        (p) => p.role === "patient" && p.patientId === room.patientId
      );
      if (patientParticipant) {
        await db.telemedicineParticipant.update({
          where: { id: patientParticipant.id },
          data: {
            joinToken: token,
            joinedAt: patientParticipant.joinedAt || now,
            leftAt: null,
            ipAddress: ip,
            userAgent: ua,
          },
        });
      } else {
        await db.telemedicineParticipant.create({
          data: {
            roomId: room.id,
            userId: null,
            patientId: room.patientId,
            role: "patient",
            joinToken: token,
            joinedAt: now,
            ipAddress: ip,
            userAgent: ua,
          },
        });
      }

      // Transition room state: created → patient_waiting.
      const updates: any = {
        patientJoinedAt: room.patientJoinedAt || now,
        patientWaitingAt: room.patientWaitingAt || now,
      };
      if (room.status === "created") {
        updates.status = "patient_waiting";
      }
      const updatedRoom = await db.telemedicineRoom.update({
        where: { id: room.id },
        data: updates,
      });

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId: room.facilityId,
        action: "TELEMEDICINE_PATIENT_JOINED",
        resourceType: "telemedicine_room",
        resourceId: room.id,
        oldValues: { status: room.status },
        newValues: {
          status: updatedRoom.status,
          role: "patient",
          isOwner: false,
        },
      });

      return NextResponse.json({
        roomUrl: getRoomUrl(room.roomName, token),
        joinToken: token,
        dev: !isDailyConfigured(),
        status: updatedRoom.status,
      });
    }

    // Unreachable — role validated above.
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  } catch (e: any) {
    console.error("[POST /api/telemedicine/rooms/[id]/join] error:", e);
    return NextResponse.json(
      {
        error: "Failed to join telemedicine room",
        detail: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
