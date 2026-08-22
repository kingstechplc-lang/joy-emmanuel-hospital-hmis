// =====================================================================
// API: /api/specialty/stats
//   GET — aggregate dashboard stats across specialty encounters,
//         appointments, and referrals.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");

  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) {
    where.facilityId = facilityId;
  } else {
    where.facilityId = { in: orgFacilityIds };
  }

  // Aggregate counts
  const [
    totalEncounters,
    completedEncounters,
    inProgressEncounters,
    todayAppointments,
    scheduledAppointments,
    pendingReferrals,
    urgentReferrals,
    activeClinics,
  ] = await Promise.all([
    db.specialtyEncounter.count({ where }),
    db.specialtyEncounter.count({ where: { ...where, status: "completed" } }),
    db.specialtyEncounter.count({ where: { ...where, status: "in_progress" } }),
    db.specialtyAppointment.count({
      where: {
        ...where,
        appointmentDate: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lte: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
    }),
    db.specialtyAppointment.count({ where: { ...where, status: "scheduled" } }),
    db.specialtyReferral.count({ where: { ...where, status: "pending" } }),
    db.specialtyReferral.count({ where: { ...where, urgency: { in: ["urgent", "emergency"] }, status: "pending" } }),
    db.specialtyClin.count({ where: { ...where, isActive: true } }),
  ]);

  // Encounters by specialty
  const bySpecialtyRaw = await db.specialtyEncounter.groupBy({
    by: ["departmentCode"],
    where,
    _count: true,
  });
  const bySpecialty = bySpecialtyRaw.map((r) => ({
    code: r.departmentCode,
    count: r._count,
  }));

  // Today's appointments by specialty
  const todayBySpecialtyRaw = await db.specialtyAppointment.groupBy({
    by: ["departmentCode"],
    where: {
      ...where,
      appointmentDate: {
        gte: new Date(new Date().setHours(0, 0, 0, 0)),
        lte: new Date(new Date().setHours(23, 59, 59, 999)),
      },
    },
    _count: true,
  });
  const todayBySpecialty = todayBySpecialtyRaw.map((r) => ({
    code: r.departmentCode,
    count: r._count,
  }));

  return NextResponse.json({
    totals: {
      encounters: totalEncounters,
      completed: completedEncounters,
      inProgress: inProgressEncounters,
      todayAppointments,
      scheduledAppointments,
      pendingReferrals,
      urgentReferrals,
      activeClinics,
    },
    bySpecialty,
    todayBySpecialty,
  });
}
