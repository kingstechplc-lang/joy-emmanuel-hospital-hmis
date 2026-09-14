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

    return NextResponse.json({ items: rooms, count: rooms.length });
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
