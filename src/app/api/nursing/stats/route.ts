// =====================================================================
// API: /api/nursing/stats
//   GET — nursing dashboard with counts
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.NURSING_VIEW) &&
      !session.user.permissions?.includes(PERMISSIONS.CLINICAL_VIEW) &&
      !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const where: any = {};
  if (facilityId) where.facilityId = facilityId;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [totalNotes, notesToday, signedNotes, draftNotes, activeCarePlans, openEscalations, criticalEscalations, pendingTasks, overdueTasks, completedTasksToday, activeHandovers, openWounds, pendingRiskAssessments] = await Promise.all([
    db.nursingNote.count({ where }),
    db.nursingNote.count({ where: { ...where, createdAt: { gte: todayStart, lte: todayEnd } } }),
    db.nursingNote.count({ where: { ...where, status: "signed" } }),
    db.nursingNote.count({ where: { ...where, status: "draft" } }),
    db.carePlan.count({ where: { ...where, status: "active" } }),
    db.nursingEscalation.count({ where: { ...where, status: { in: ["open", "acknowledged", "in_progress"] } } }),
    db.nursingEscalation.count({ where: { ...where, priority: "critical", status: { not: "resolved" } } }),
    db.nursingTask.count({ where: { ...where, status: { in: ["pending", "due"] } } }),
    db.nursingTask.count({ where: { ...where, status: "pending", dueAt: { lt: new Date() } } }),
    db.nursingTask.count({ where: { ...where, status: "completed", completedAt: { gte: todayStart, lte: todayEnd } } }),
    db.nursingHandover.count({ where: { ...where, status: "active" } }),
    db.woundAssessment.count({ where: { ...where } }),
    db.riskAssessment.count({ where: { ...where, reviewDate: { lt: new Date() } } }),
  ]);

  // Notes by type
  const byTypeRaw = await db.nursingNote.groupBy({
    by: ["noteType"],
    where,
    _count: true,
  });
  const byType = byTypeRaw.map((r) => ({ label: r.noteType || "unspecified", count: r._count }));

  return NextResponse.json({
    totalNotes, notesToday, signedNotes, draftNotes,
    activeCarePlans, openEscalations, criticalEscalations,
    pendingTasks, overdueTasks, completedTasksToday,
    activeHandovers, openWounds, pendingRiskAssessments,
    byType,
  });
}
