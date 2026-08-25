// =====================================================================
// API: /api/beds/[id]/history
//   GET — complete bed history (assignments, cleanings, maintenance, blocks, reservations)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_VIEW) && !session.user.permissions?.includes(PERMISSIONS.BED_MANAGE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const [assignments, cleanings, maintenances, blocks, reservations] = await Promise.all([
    db.bedAssignment.findMany({
      where: { bedId: id },
      orderBy: { assignedAt: "desc" },
      take: 50,
      include: {
        patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true } },
        admission: { select: { id: true, admissionNumber: true, admissionType: true, admittedAt: true, dischargedAt: true, status: true } },
      },
    }),
    db.bedCleaning.findMany({ where: { bedId: id }, orderBy: { initiatedAt: "desc" }, take: 30 }),
    db.bedMaintenance.findMany({ where: { bedId: id }, orderBy: { reportedAt: "desc" }, take: 30 }),
    db.bedBlock.findMany({ where: { bedId: id }, orderBy: { blockedAt: "desc" }, take: 30 }),
    db.bedReservation.findMany({
      where: { bedId: id },
      orderBy: { reservedAt: "desc" },
      take: 30,
    }),
  ]);

  // Merge into a unified timeline
  const timeline: any[] = [];
  for (const a of assignments) {
    timeline.push({ type: "assignment", date: a.assignedAt, record: a });
  }
  for (const c of cleanings) {
    timeline.push({ type: "cleaning", date: c.initiatedAt, record: c });
  }
  for (const m of maintenances) {
    timeline.push({ type: "maintenance", date: m.reportedAt, record: m });
  }
  for (const b of blocks) {
    timeline.push({ type: "block", date: b.blockedAt, record: b });
  }
  for (const r of reservations) {
    timeline.push({ type: "reservation", date: r.reservedAt, record: r });
  }
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({
    assignments,
    cleanings,
    maintenances,
    blocks,
    reservations,
    timeline,
  });
}
