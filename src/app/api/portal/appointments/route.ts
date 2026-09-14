// =====================================================================
// API: /api/portal/appointments
//   GET — list upcoming + past appointments for the authenticated patient
//
// Authorization: Bearer <portal-jwt>
//
// Query params:
//   ?status=upcoming   — appointments with startAt > now, status="scheduled"
//   ?status=past       — appointments with startAt <= now OR status != "scheduled"
//   (default)          — all appointments, most recent first
//
// Patients can NOT create appointments from the portal (v1) — they call
// the hospital to book. v1 is read-only for appointments.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalSessionFromRequest } from "@/lib/patient-portal/jwt";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

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
  const statusFilter = url.searchParams.get("status") || "all";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));

  const where: any = { patientId: session.patientId };
  const now = new Date();
  if (statusFilter === "upcoming") {
    where.startAt = { gt: now };
    where.status = "scheduled";
  } else if (statusFilter === "past") {
    where.OR = [
      { startAt: { lte: now } },
      { status: { in: ["completed", "cancelled", "no_show"] } },
    ];
  }

  const appointments = await db.appointment.findMany({
    where,
    orderBy: { startAt: "desc" },
    take: limit,
    select: {
      id: true,
      appointmentNumber: true,
      startAt: true,
      endAt: true,
      status: true,
      appointmentType: true,
      reason: true,
      notes: true,
      cancelReason: true,
      cancelledAt: true,
      // Don't expose staff-only fields
      clinician: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      department: {
        select: { id: true, name: true },
      },
      facility: {
        select: { id: true, name: true, code: true },
      },
    },
  });

  return NextResponse.json({ items: appointments, count: appointments.length });
}
