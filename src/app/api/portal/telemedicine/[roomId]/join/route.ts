// =====================================================================
// API: /api/portal/telemedicine/[roomId]/join
//   POST — patient joins the telemedicine room (updates status to
//          patient_waiting so the doctor can see + admit them)
//
// Uses the PORTAL JWT (not NextAuth) — patient authentication.
//
// Body: { } (no body needed — the patient identity comes from the JWT)
//
// Flow:
//   1. Verify the portal JWT → get patientId
//   2. Find the TelemedicineRoom by roomId
//   3. Verify the room belongs to this patient
//   4. Update status to "patient_waiting" + set patientWaitingAt
//   5. Return success (the roomUrl was already returned by the list
//      endpoint — no need to mint a new token here)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalSessionFromRequest } from "@/lib/patient-portal/jwt";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await getPortalSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.patientId) {
    return NextResponse.json({ error: "Account pending identity verification" }, { status: 403 });
  }

  const { roomId } = await params;

  try {
    const room = await db.telemedicineRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        patientId: true,
        status: true,
        roomName: true,
        appointmentId: true,
      },
    });

    if (!room) {
      return NextResponse.json({ error: "Telemedicine room not found" }, { status: 404 });
    }

    // Verify this room belongs to the authenticated patient
    if (room.patientId !== session.patientId) {
      return NextResponse.json({ error: "This room does not belong to your account" }, { status: 403 });
    }

    // If the room is already in_progress or ended, don't change the status
    if (room.status === "in_progress" || room.status === "ended") {
      return NextResponse.json({ ok: true, status: room.status });
    }

    // Update the room to patient_waiting
    const updated = await db.telemedicineRoom.update({
      where: { id: roomId },
      data: {
        status: "patient_waiting",
        patientJoinedAt: new Date(),
        patientWaitingAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, status: updated.status });
  } catch (e: any) {
    console.error("[POST /api/portal/telemedicine/[roomId]/join] error:", e);
    return NextResponse.json(
      { error: "Failed to join room", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
