// =====================================================================
// API: /api/training-dashboard
//   GET — aggregated training statistics
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
  if (!hasPermission(session, PERMISSIONS.TRAINING_VIEW) && !hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    totalPrograms,
    activePrograms,
    mandatoryPrograms,
    upcomingSessions,
    completedSessions,
    cancelledSessions,
    totalEnrollments,
    completedEnrollments,
    pendingEnrollments,
    totalCertificates,
    expiringCertificates,
    expiredCertificates,
    totalProviders,
    totalTrainers,
    totalAssessments,
    totalCPDRecords,
    mandatoryCompliance,
  ] = await Promise.all([
    db.trainingProgram.count({ where }),
    db.trainingProgram.count({ where: { ...where, status: "active" } }),
    db.trainingProgram.count({ where: { ...where, isMandatory: true } }),
    db.trainingSession.count({ where: { ...where, sessionDate: { gte: now }, status: "scheduled" } }),
    db.trainingSession.count({ where: { ...where, status: "completed" } }),
    db.trainingSession.count({ where: { ...where, status: "cancelled" } }),
    db.trainingEnrollment.count({ where: { organizationId: session.user.organizationId } }),
    db.trainingEnrollment.count({ where: { organizationId: session.user.organizationId, status: "completed" } }),
    db.trainingEnrollment.count({ where: { organizationId: session.user.organizationId, status: { in: ["pending", "approved", "confirmed"] } } }),
    db.trainingCertificate.count({ where: { organizationId: session.user.organizationId } }),
    db.trainingCertificate.count({ where: { organizationId: session.user.organizationId, expiryDate: { gte: now, lte: thirtyDaysFromNow }, status: "valid" } }),
    db.trainingCertificate.count({ where: { organizationId: session.user.organizationId, expiryDate: { lt: now }, status: { not: "revoked" } } }),
    db.trainingProvider.count({ where: { organizationId: session.user.organizationId, active: true } }),
    db.trainer.count({ where: { organizationId: session.user.organizationId, status: "active" } }),
    db.trainingAssessment.count({ where: { organizationId: session.user.organizationId } }),
    db.cPDRecord.count({ where: { organizationId: session.user.organizationId } }),
    // Mandatory compliance: completed / total mandatory enrollments
    db.trainingEnrollment.count({ where: { organizationId: session.user.organizationId, program: { isMandatory: true }, status: "completed" } }),
  ]);

  const totalMandatoryEnrollments = await db.trainingEnrollment.count({
    where: { organizationId: session.user.organizationId, program: { isMandatory: true } },
  }).catch(() => 0);

  const complianceRate = totalMandatoryEnrollments > 0 ? Math.round((mandatoryCompliance / totalMandatoryEnrollments) * 100) : 0;

  // Recent training records (legacy)
  const recentTrainingRecords = await db.trainingRecord.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { trainingDate: "desc" },
    take: 10,
    include: { staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } } },
  });

  // Upcoming sessions
  const upcomingSessionsList = await db.trainingSession.findMany({
    where: { ...where, sessionDate: { gte: now }, status: "scheduled" },
    orderBy: { sessionDate: "asc" },
    take: 10,
    include: {
      program: { select: { id: true, title: true, code: true } },
      facility: { select: { id: true, name: true } },
      trainer: { select: { id: true, name: true } },
      _count: { select: { enrollments: true } },
    },
  });

  return NextResponse.json({
    stats: {
      totalPrograms,
      activePrograms,
      mandatoryPrograms,
      upcomingSessions,
      completedSessions,
      cancelledSessions,
      totalEnrollments,
      completedEnrollments,
      pendingEnrollments,
      totalCertificates,
      expiringCertificates,
      expiredCertificates,
      totalProviders,
      totalTrainers,
      totalAssessments,
      totalCPDRecords,
      mandatoryCompliance,
      totalMandatoryEnrollments,
      complianceRate,
    },
    recentTrainingRecords,
    upcomingSessions: upcomingSessionsList,
  });
}
