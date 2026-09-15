// =====================================================================
// API: /api/telemedicine/rooms
//   GET — list telemedicine rooms with filters.
//
// Query params:
//   ?status=created|patient_waiting|in_progress|ended
//   ?patientId=
//   ?facilityId=
//   ?clinicianId=
//
// Permission: telemedicine.view (or reuse clinical.view).
//
// For staff: show all rooms in their facility (super_admin sees all
// rooms in their organization). FacilityId filter is constrained to
// the user's org.
//
// For patient portal: this route is NOT used by the patient portal —
// portal endpoints live under /api/portal/* and use portal JWT auth.
// Patients have a dedicated GET /api/portal/telemedicine endpoint.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasAnyPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_STATUSES = ["created", "patient_waiting", "in_progress", "ended"];

const VIEW_PERMS = [PERMISSIONS.CLINICAL_VIEW];

export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const patientId = url.searchParams.get("patientId");
  const facilityParam = url.searchParams.get("facilityId");
  const clinicianId = url.searchParams.get("clinicianId");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "50"),
    500
  );

  // Status validation — reject 400 instead of silently returning empty.
  if (statusParam && !VALID_STATUSES.includes(statusParam)) {
    return NextResponse.json(
      {
        error: `Invalid status. Valid values: ${VALID_STATUSES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Facility scoping — non-super_admin users are constrained to their
  // own facility (or org). super_admin can override via the query param.
  const isSuperAdmin = session.user.roles.includes("super_admin");
  const where: any = { organizationId: session.user.organizationId };

  if (statusParam) where.status = statusParam;
  if (patientId) where.patientId = patientId;
  if (clinicianId) where.clinicianId = clinicianId;

  if (facilityParam) {
    // Caller explicitly requested a facility — verify it belongs to
    // their org (IDOR protection).
    if (isSuperAdmin) {
      where.facilityId = facilityParam;
    } else {
      // Non-super-admin: must request their own facility or be rejected.
      if (
        session.user.facilityId &&
        facilityParam !== session.user.facilityId
      ) {
        return NextResponse.json(
          { error: "You can only view rooms in your own facility." },
          { status: 403 }
        );
      }
      where.facilityId = session.user.facilityId || facilityParam;
    }
  } else if (!isSuperAdmin) {
    // Default: scope to the user's facility.
    if (session.user.facilityId) where.facilityId = session.user.facilityId;
  }

  try {
    // ── Step 1: Fetch existing TelemedicineRoom records ────────────
    const rooms = await db.telemedicineRoom.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
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
            appointmentType: true,
            department: { select: { id: true, name: true } },
          },
        },
        encounter: { select: { id: true, encounterNumber: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        participants: {
          select: {
            id: true,
            role: true,
            userId: true,
            patientId: true,
            joinedAt: true,
            leftAt: true,
            durationSec: true,
          },
        },
      },
    });

    // ── Step 2: Fetch telemedicine-type appointments that DON'T have
    //    a room yet — these show up as "pending" cards with a
    //    "Create Room" button so the doctor can start the call. ─────
    const roomAppointmentIds = rooms.map((r) => r.appointmentId).filter(Boolean);

    const appointmentWhere: any = {
      // ⚠️ Appointment model has NO organizationId field — it only has
      // facilityId. Org scoping is handled via facilityId (inherited
      // from the room query's facility scoping above).
      appointmentType: "telemedicine",
      status: { notIn: ["cancelled", "no_show"] },
    };
    // Inherit facility scoping from the room query
    if (where.facilityId) appointmentWhere.facilityId = where.facilityId;
    // Inherit patientId filter
    if (patientId) appointmentWhere.patientId = patientId;
    // Exclude appointments that already have rooms
    if (roomAppointmentIds.length > 0) {
      appointmentWhere.id = { notIn: roomAppointmentIds };
    }

    const pendingAppointments = await db.appointment.findMany({
      where: appointmentWhere,
      orderBy: { scheduledStart: "desc" },
      take: limit,
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
        facility: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true } },
      },
    });

    // ── Step 3: Merge — pending appointments become "virtual rooms"
    //    with status="pending" so the UI can render them uniformly.
    //    The doctor sees a "Create Room" button instead of "Join Call".
    const pendingRooms = pendingAppointments.map((apt) => ({
      id: `pending-${apt.id}`,
      _pending: true, // flag so the UI knows this is an appointment, not a room
      appointmentId: apt.id,
      patientId: apt.patientId,
      facilityId: apt.facilityId,
      clinicianId: null,
      status: "pending",
      roomName: null,
      roomUrl: null,
      createdAt: apt.createdAt,
      updatedAt: apt.updatedAt,
      appointment: {
        id: apt.id,
        appointmentNumber: apt.appointmentNumber,
        scheduledStart: apt.scheduledStart,
        reason: apt.reason,
        appointmentType: apt.appointmentType,
        department: apt.department,
      },
      patient: apt.patient,
      facility: apt.facility,
      clinician: null,
      encounter: null,
      consultationId: null,
      participants: [],
    }));

    // Combine: pending appointments first (upcoming), then existing rooms
    const allItems = [...pendingRooms, ...rooms];

    return NextResponse.json({ items: allItems, count: allItems.length });
  } catch (e: any) {
    console.error("[GET /api/telemedicine/rooms] error:", e);
    return NextResponse.json(
      {
        error: "Failed to load telemedicine rooms",
        detail: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
