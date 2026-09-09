// =====================================================================
// API: /api/cdss/health
//   GET    — returns live CDSS subsystem status:
//              - clinical alerts: total, active, critical, last 24h
//              - discharge summaries: total, drafts, finalized today
//              - wristbands: total, active, printed today
//              - medication labels: total, active, high-alert count
//              - recent audit log entries (CDSS-related actions)
//              - top contributors (most active CDSS users)
//              - engine rule coverage: DDI interaction rule count
//
// PERMISSIONS:
//   GET     requires  cdss.view  (or super_admin)
//
// Used by the CDSS Health Center dashboard view for live status panels.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const CDSS_AUDIT_ACTIONS = [
  // Clinical alerts
  "CLINICAL_ALERT_ACKNOWLEDGED",
  "CLINICAL_ALERT_DISMISSED",
  "CLINICAL_ALERT_OVERRIDDEN",
  "CLINICAL_ALERT_ESCALATED",
  "CLINICAL_ALERT_RESOLVED",
  "CLINICAL_ALERT_GENERATED",
  // Discharge summaries
  "discharge_summary.create",
  "discharge_summary.review",
  "discharge_summary.approve",
  "discharge_summary.finalize",
  "discharge_summary.amend",
  "discharge_summary.delete",
  // Wristbands
  "wristband.create",
  "wristband.replace",
  "wristband.reprint",
  "wristband.void",
  // Medication labels
  "medication_label.create",
  "medication_label.reprint",
  "medication_label.void",
  // CDSS engine
  "CDSS_CHECK",
  "TRIAGE_RECORDED",
  "PRESCRIPTION_CREATED",
  "LAB_CRITICAL_RESULT_ACKNOWLEDGED",
];

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CDSS_VIEW)) {
    return NextResponse.json({ error: "Forbidden — requires cdss.view" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const organizationId = session.user.organizationId;

  try {
    // Build the facility-scoped where clause
    const where: any = { organizationId };
    if (facilityId) where.facilityId = facilityId;
    const whereWithFacility: any = facilityId ? { facilityId } : {};

    // ─── Clinical Alerts ──────────────────────────────────────────
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [alertsTotal, alertsActive, alertsCritical, alertsLast24h, alertsByType, alertsBySeverity] =
      await Promise.all([
        db.clinicalAlert.count({ where }),
        db.clinicalAlert.count({ where: { ...where, status: "active" } }),
        db.clinicalAlert.count({
          where: { ...where, status: "active", severity: "critical" },
        }),
        db.clinicalAlert.count({
          where: { ...where, createdAt: { gte: yesterday } },
        }),
        db.clinicalAlert.groupBy({
          by: ["alertType"],
          where,
          _count: { _all: true },
          orderBy: { _count: { _all: "desc" } },
        }),
        db.clinicalAlert.groupBy({
          by: ["severity"],
          where,
          _count: { _all: true },
          orderBy: { _count: { _all: "desc" } },
        }),
      ]);

    // ─── Discharge Summaries ──────────────────────────────────────
    const [summariesTotal, summariesDraft, summariesReviewed, summariesApproved, summariesFinalized, summariesFinalizedToday] =
      await Promise.all([
        db.dischargeSummary.count({ where }),
        db.dischargeSummary.count({ where: { ...where, status: "draft" } }),
        db.dischargeSummary.count({ where: { ...where, status: "reviewed" } }),
        db.dischargeSummary.count({ where: { ...where, status: "approved" } }),
        db.dischargeSummary.count({ where: { ...where, status: "finalized" } }),
        db.dischargeSummary.count({
          where: { ...where, status: "finalized", finalizedAt: { gte: yesterday } },
        }),
      ]);

    // ─── Patient Wristbands ──────────────────────────────────────
    const [wristbandsTotal, wristbandsActive, wristbandsReplaced, wristbandsVoided, wristbandsPrintedToday] =
      await Promise.all([
        db.patientWristband.count({ where }),
        db.patientWristband.count({ where: { ...where, status: "active" } }),
        db.patientWristband.count({ where: { ...where, status: "replaced" } }),
        db.patientWristband.count({ where: { ...where, status: "voided" } }),
        db.patientWristband.count({
          where: { ...where, lastPrintedAt: { gte: yesterday } },
        }),
      ]);

    // ─── Medication Labels ────────────────────────────────────────
    const [labelsTotal, labelsActive, labelsVoided, labelsHighAlert, labelsPrintedToday, labelsControlled] =
      await Promise.all([
        db.medicationLabel.count({ where }),
        db.medicationLabel.count({ where: { ...where, status: "active" } }),
        db.medicationLabel.count({ where: { ...where, status: "voided" } }),
        db.medicationLabel.count({ where: { ...where, isHighAlert: true } }),
        db.medicationLabel.count({
          where: { ...where, lastPrintedAt: { gte: yesterday } },
        }),
        db.medicationLabel.count({
          where: {
            ...where,
            controlledStatus: { not: null, notIn: ["none", ""] },
          },
        }),
      ]);

    // ─── Engine rule coverage ────────────────────────────────────
    const interactionRuleCount = await db.medicationInteraction.count({
      where: { organizationId },
    });

    // ─── Recent audit log entries (CDSS-related actions) ────────
    const auditWhere: any = {
      organizationId,
      action: { in: CDSS_AUDIT_ACTIONS },
    };
    if (facilityId) auditWhere.facilityId = facilityId;

    const recentAuditLogs = await db.auditLog.findMany({
      where: auditWhere,
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // ─── Top contributors (CDSS actions in last 7 days) ──────────
    const auditInLast7d = await db.auditLog.findMany({
      where: {
        ...auditWhere,
        createdAt: { gte: weekAgo },
      },
      select: { userId: true, action: true },
    });
    const contributorCounts: Record<string, { count: number; userId: string }> = {};
    for (const a of auditInLast7d) {
      if (!a.userId) continue;
      if (!contributorCounts[a.userId]) {
        contributorCounts[a.userId] = { count: 0, userId: a.userId };
      }
      contributorCounts[a.userId].count++;
    }
    const topContributorIds = Object.values(contributorCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((c) => c.userId);
    const topContributorUsers = topContributorIds.length
      ? await db.user.findMany({
          where: { id: { in: topContributorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const topContributors = topContributorIds.map((id) => {
      const u = topContributorUsers.find((x) => x.id === id);
      return {
        userId: id,
        firstName: u?.firstName || "—",
        lastName: u?.lastName || "Unknown",
        count: contributorCounts[id].count,
      };
    });

    // ─── Mean time to acknowledge (MTTA) for active alerts ──────
    // Computed from acknowledged alerts in the last 7 days.
    const acknowledgedAlertsIn7d = await db.clinicalAlert.findMany({
      where: {
        ...where,
        status: { in: ["acknowledged", "overridden", "escalated", "resolved"] },
        acknowledgedAt: { not: null, gte: weekAgo },
      },
      select: { createdAt: true, acknowledgedAt: true },
    });
    let mttaMinutes: number | null = null;
    if (acknowledgedAlertsIn7d.length > 0) {
      const totalMs = acknowledgedAlertsIn7d.reduce((sum, a) => {
        if (!a.acknowledgedAt) return sum;
        return sum + (a.acknowledgedAt.getTime() - a.createdAt.getTime());
      }, 0);
      mttaMinutes = Math.round(totalMs / acknowledgedAlertsIn7d.length / 60000);
    }

    // ─── Subsystem response shape ──────────────────────────────
    return NextResponse.json({
      generatedAt: now.toISOString(),
      facilityId: facilityId || null,
      organizationId,
      // Clinical alerts subsystem
      clinicalAlerts: {
        total: alertsTotal,
        active: alertsActive,
        critical: alertsCritical,
        last24h: alertsLast24h,
        mttaMinutes,
        byType: alertsByType.map((t) => ({ type: t.alertType, count: t._count._all })),
        bySeverity: alertsBySeverity.map((s) => ({ severity: s.severity, count: s._count._all })),
      },
      // Discharge summaries subsystem
      dischargeSummaries: {
        total: summariesTotal,
        drafts: summariesDraft,
        reviewed: summariesReviewed,
        approved: summariesApproved,
        finalized: summariesFinalized,
        finalizedToday: summariesFinalizedToday,
      },
      // Patient wristbands subsystem
      wristbands: {
        total: wristbandsTotal,
        active: wristbandsActive,
        replaced: wristbandsReplaced,
        voided: wristbandsVoided,
        printedToday: wristbandsPrintedToday,
      },
      // Medication labels subsystem
      medicationLabels: {
        total: labelsTotal,
        active: labelsActive,
        voided: labelsVoided,
        highAlert: labelsHighAlert,
        controlled: labelsControlled,
        printedToday: labelsPrintedToday,
      },
      // CDSS engine rule coverage
      engine: {
        interactionRules: interactionRuleCount,
      },
      // Recent audit log feed (CDSS actions only)
      recentAuditLogs: recentAuditLogs.map((a) => ({
        id: a.id,
        action: a.action,
        resourceType: a.resourceType,
        resourceId: a.resourceId,
        userId: a.userId,
        userName: a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : "System",
        createdAt: a.createdAt.toISOString(),
        reason: a.reason || null,
      })),
      // Top contributors over last 7 days
      topContributors,
      // Aggregate counts
      aggregates: {
        totalAuditActionsIn7d: auditInLast7d.length,
        totalSubsystemsTracked: 4,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/cdss/health]", e);
    return NextResponse.json(
      { error: e.message || "Failed to load CDSS health" },
      { status: 500 },
    );
  }
}
