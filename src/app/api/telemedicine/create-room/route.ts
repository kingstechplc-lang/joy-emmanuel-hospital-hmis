// =====================================================================
// API: /api/telemedicine/create-room
//   POST — create a new telemedicine room + the doctor + patient
//          participant rows.
//
// Body: { appointmentId?, encounterId?, patientId, facilityId }
//
// Permission: telemedicine.create (or reuse consultation.create /
// clinical.create if telemedicine perms aren't yet defined — they're
// not, as of this writing, so we accept the clinical ones).
//
// Flow:
//   1. Validate required body fields.
//   2. Validate that the patient exists + belongs to the caller's
//      facility/organization (IDOR protection).
//   3. Generate a Daily.co-safe room name: jem-{16 random hex chars}.
//   4. Call Daily.co createRoom() to mint the URL.
//   5. Create the TelemedicineRoom record with status="created".
//   6. Create two TelemedicineParticipant rows:
//        - role="doctor"  → userId = session.user.id (the clinician who
//                           will join), patientId = null
//        - role="patient" → patientId = body.patientId, userId = null
//   7. Audit log TELEMEDICINE_ROOM_CREATED.
//   8. Return { room } — the full TelemedicineRoom record.
//
// If the linked Appointment has a staffId, we use it as the clinicianId
// on the TelemedicineRoom (so the right doctor sees the room in their
// queue). Otherwise we default to the calling user.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasAnyPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  createRoom as createDailyRoom,
  generateRoomName,
} from "@/lib/telemedicine/daily-co";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// In the absence of dedicated telemedicine.* perms, accept the clinical
// ones (consultations are clinical). Super_admin always bypasses.
const CREATE_PERMS = [PERMISSIONS.CLINICAL_CREATE];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAnyPermission(session, CREATE_PERMS)) {
    return NextResponse.json(
      { error: "Forbidden — missing telemedicine.create permission" },
      { status: 403 }
    );
  }

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

  const { appointmentId, encounterId, patientId, facilityId } = body;
  if (!patientId || !facilityId) {
    return NextResponse.json(
      { error: "patientId and facilityId are required" },
      { status: 400 }
    );
  }

  // IDOR / consistency — patient must exist + belong to the caller's org.
  // The Facility→Organization FK gives us org isolation; we additionally
  // check the user's facilityId matches when present.
  const patient = await db.patient.findFirst({
    where: { id: patientId },
    include: { facility: { select: { organizationId: true } } },
  });
  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  // Organization isolation: every patient row sits under a Facility which
  // sits under an Organization. The caller's session.organizationId must
  // match. Patients without a facility (rare legacy data) are blocked
  // from telemedicine — they'd be unsupervised.
  const patientOrgId = (patient as any).facility?.organizationId;
  if (!patientOrgId || patientOrgId !== session.user.organizationId) {
    return NextResponse.json(
      { error: "Patient does not belong to your organization." },
      { status: 403 }
    );
  }

  // Verify facility belongs to caller's org too.
  const facility = await db.facility.findUnique({
    where: { id: facilityId },
    select: { id: true, organizationId: true, name: true },
  });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json(
      { error: "Facility not found in your organization." },
      { status: 403 }
    );
  }

  // Optional: if appointmentId provided, verify it belongs to this patient.
  if (appointmentId) {
    const appt = await db.appointment.findFirst({
      where: { id: appointmentId, patientId },
      select: { id: true, facilityId: true },
    });
    if (!appt) {
      return NextResponse.json(
        { error: "Appointment not found for this patient" },
        { status: 404 }
      );
    }
    if (appt.facilityId !== facilityId) {
      return NextResponse.json(
        { error: "Appointment belongs to a different facility" },
        { status: 400 }
      );
    }
    // Note: we DON'T use appt.staffId as the clinicianId because
    // staffId is a FK to the Staff table, NOT the User table.
    // The clinicianId on TelemedicineRoom is a FK to User.
    // The doctor who creates the room is the doctor who will join.
  }

  // Optional: if encounterId provided, verify it belongs to this patient.
  if (encounterId) {
    const enc = await db.encounter.findFirst({
      where: { id: encounterId, patientId },
      select: { id: true, facilityId: true },
    });
    if (!enc) {
      return NextResponse.json(
        { error: "Encounter not found for this patient" },
        { status: 404 }
      );
    }
    if (enc.facilityId !== facilityId) {
      return NextResponse.json(
        { error: "Encounter belongs to a different facility" },
        { status: 400 }
      );
    }
  }

  try {
    // 1. Generate the Daily.co room name + URL.
    const roomName = generateRoomName("jem");
    const dailyResult = await createDailyRoom(roomName, "private");
    const roomUrl = dailyResult.roomUrl;

    // 2. Create the TelemedicineRoom + participants.
    // The clinicianId is always the calling user (the doctor who
    // creates the room is the doctor who will join the call).
    const clinicianId = session.user.id;

    const room = await db.telemedicineRoom.create({
      data: {
        organizationId: session.user.organizationId,
        facilityId,
        appointmentId: appointmentId || null,
        encounterId: encounterId || null,
        patientId,
        clinicianId,
        roomName,
        roomUrl,
        status: "created",
        createdById: session.user.id,
        participants: {
          create: [
            {
              // Doctor (staff) participant.
              userId: clinicianId,
              patientId: null,
              role: "doctor",
              // joinToken populated when the doctor actually joins.
            },
            {
              // Patient participant.
              userId: null,
              patientId,
              role: "patient",
            },
          ],
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            patientNumber: true,
            firstName: true,
            lastName: true,
            sex: true,
            dateOfBirth: true,
          },
        },
        clinician: {
          select: { id: true, firstName: true, lastName: true },
        },
        facility: { select: { id: true, name: true, code: true } },
        appointment: { select: { id: true, appointmentNumber: true } },
        encounter: { select: { id: true, encounterNumber: true } },
        participants: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId,
      action: "TELEMEDICINE_ROOM_CREATED",
      resourceType: "telemedicine_room",
      resourceId: room.id,
      newValues: {
        roomName,
        roomUrl,
        patientId,
        clinicianId,
        appointmentId: appointmentId || null,
        encounterId: encounterId || null,
        status: "created",
        dev: dailyResult.dev,
      },
    });

    return NextResponse.json({ room }, { status: 201 });
  } catch (e: any) {
    console.error("[POST /api/telemedicine/create-room] error:", e);
    return NextResponse.json(
      {
        error: "Failed to create telemedicine room",
        detail: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
