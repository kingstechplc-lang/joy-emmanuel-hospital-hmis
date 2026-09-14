// =====================================================================
// API: /api/portal/appointments
//   GET — list appointments with search + type filter
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalSessionFromRequest } from "@/lib/patient-portal/jwt";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getPortalSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.patientId) {
    return NextResponse.json({ error: "Account pending identity verification", needsIdentity: true }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("search") || "";
  const typeFilter = url.searchParams.get("type") || "";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));

  try {
    const where: any = { patientId: session.patientId };
    const now = new Date();
    if (statusFilter === "upcoming") {
      where.scheduledStart = { gt: now };
      where.status = "scheduled";
    } else if (statusFilter === "past") {
      where.OR = [
        { scheduledStart: { lte: now } },
        { status: { in: ["completed", "cancelled", "no_show"] } },
      ];
    }

    // Type filter
    if (typeFilter && typeFilter !== "all") {
      where.appointmentType = typeFilter;
    }

    // Search — by reason or appointment number
    if (search) {
      where.OR = [
        { appointmentNumber: { contains: search, mode: "insensitive" } },
        { reason: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    const appointments = await db.appointment.findMany({
      where,
      orderBy: { scheduledStart: "desc" },
      take: limit,
      select: {
        id: true,
        appointmentNumber: true,
        scheduledStart: true,
        scheduledEnd: true,
        status: true,
        appointmentType: true,
        reason: true,
        notes: true,
        department: { select: { id: true, name: true } },
        facility: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({ items: appointments, count: appointments.length });
  } catch (e: any) {
    console.error("[GET /api/portal/appointments] error:", e);
    return NextResponse.json(
      { error: "Failed to load appointments", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
