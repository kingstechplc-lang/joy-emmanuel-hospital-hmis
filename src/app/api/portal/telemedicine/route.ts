// =====================================================================
// API: /api/portal/telemedicine
//   GET — list the authenticated patient's telemedicine rooms.
//
// Uses the patient-portal JWT (PATIENT_PORTAL_JWT_SECRET) — NOT the
// staff NextAuth session. The portal JWT is verified by
// getPortalSessionFromRequest(req) which extracts the Bearer token
// from the Authorization header.
//
// Returns rooms for the authenticated patient only (scoped by
// session.patientId). All rooms are returned in a single payload but
// the response shape splits them into:
//   - upcoming: status in ["created", "patient_waiting", "in_progress"]
//   - past:     status === "ended"
//
// Each room includes the join URL + a freshly-minted patient meeting
// token (so the portal iframe can immediately load the room). For
// ended rooms, the token field is null (no point joining).
//
// Audit: portal access is logged via PortalAccessLog rows (created by
// the patient-portal middleware, not here).
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalSessionFromRequest } from "@/lib/patient-portal/jwt";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  createMeetingToken,
  getRoomUrl,
} from "@/lib/telemedicine/daily-co";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const ACTIVE_STATUSES = ["created", "patient_waiting", "in_progress"];

export async function GET(req: Request) {
  const session = await getPortalSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.patientId) {
    return NextResponse.json(
      {
        error: "Account pending identity verification",
        needsIdentity: true,
      },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") || 50)),
    100
  );

  try {
    // Patient scoping — only this patient's rooms, and only within
    // the portal account's organization (defense in depth: even if
    // the JWT was tampered with, the patientId is constrained).
    const where = {
      patientId: session.patientId,
      organizationId: session.organizationId,
    };

    const rooms = await db.telemedicineRoom.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        roomName: true,
        status: true,
        createdAt: true,
        patientJoinedAt: true,
        patientWaitingAt: true,
        admittedAt: true,
        callStartedAt: true,
        callEndedAt: true,
        callDurationSec: true,
        appointmentId: true,
        encounterId: true,
        consultationId: true,
        clinician: {
          select: { id: true, firstName: true, lastName: true },
        },
        facility: {
          select: { id: true, name: true, code: true },
        },
        appointment: {
          select: {
            id: true,
            appointmentNumber: true,
            scheduledStart: true,
            reason: true,
          },
        },
      },
    });

    // Mint a fresh patient meeting token for each ACTIVE room. Ended
    // rooms get token=null (no point joining).
    const upcoming: any[] = [];
    const past: any[] = [];
    for (const room of rooms) {
      const isActive = ACTIVE_STATUSES.includes(room.status);
      let joinToken: string | null = null;
      let roomUrl: string | null = null;
      if (isActive) {
        try {
          joinToken = await createMeetingToken(
            room.roomName,
            false, // patient is never an owner
            "Patient"
          );
          roomUrl = getRoomUrl(room.roomName, joinToken);
        } catch (e: any) {
          // Don't fail the whole list if one token mint fails — just
          // exclude that room's join URL so the patient sees the call
          // but can't join (and the portal UI shows a retry button).
          console.error(
            `[portal/telemedicine] token mint failed for room ${room.roomName}:`,
            e
          );
          roomUrl = getRoomUrl(room.roomName);
        }
      }
      const dto = {
        ...room,
        joinToken,
        roomUrl,
        // Don't expose raw Date objects that might leak timezone —
        // ISO strings are unambiguous for the client.
        createdAt: room.createdAt?.toISOString?.() || room.createdAt,
        patientJoinedAt: room.patientJoinedAt?.toISOString?.() || null,
        patientWaitingAt: room.patientWaitingAt?.toISOString?.() || null,
        admittedAt: room.admittedAt?.toISOString?.() || null,
        callStartedAt: room.callStartedAt?.toISOString?.() || null,
        callEndedAt: room.callEndedAt?.toISOString?.() || null,
      };
      if (isActive) upcoming.push(dto);
      else past.push(dto);
    }

    return NextResponse.json({
      items: upcoming,
      upcoming,
      past,
      count: rooms.length,
    });
  } catch (e: any) {
    console.error("[GET /api/portal/telemedicine] error:", e);
    return NextResponse.json(
      {
        error: "Failed to load telemedicine rooms",
        detail: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
