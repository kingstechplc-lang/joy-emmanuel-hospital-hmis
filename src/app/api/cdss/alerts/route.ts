// =====================================================================
// /api/cdss/alerts — Clinical alert list + lifecycle actions
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { acknowledgeAlert, dismissAlert, overrideAlert, escalateAlert, resolveAlert } from "@/lib/cdss/engine";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET — list clinical alerts (filtered by facility, patient, type, status, severity)
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_ALERT_VIEW) && !hasPermission(session, PERMISSIONS.CDSS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const patientId = url.searchParams.get("patientId");
  const encounterId = url.searchParams.get("encounterId");
  const alertType = url.searchParams.get("alertType");
  const status = url.searchParams.get("status") || "active";
  const severity = url.searchParams.get("severity");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);

  const where: any = {
    organizationId: session.user.organizationId,
  };
  if (facilityId) where.facilityId = facilityId;
  if (patientId) where.patientId = patientId;
  if (encounterId) where.encounterId = encounterId;
  if (alertType) where.alertType = alertType;
  if (status && status !== "all") where.status = status;
  if (severity) where.severity = severity;

  const items = await db.clinicalAlert.findMany({
    where,
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

// POST — lifecycle actions (acknowledge, dismiss, override, escalate, resolve)
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, alertId, note, reason } = body;
  if (!alertId || !action) return NextResponse.json({ error: "alertId and action required" }, { status: 400 });

  // Verify alert belongs to user's org
  const alert = await db.clinicalAlert.findFirst({
    where: { id: alertId, organizationId: session.user.organizationId },
  });
  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

  const auditAction = (a: string) => `CLINICAL_ALERT_${a.toUpperCase()}`;

  switch (action) {
    case "acknowledge":
      if (!hasPermission(session, PERMISSIONS.CLINICAL_ALERT_ACKNOWLEDGE) && !hasPermission(session, PERMISSIONS.CDSS_VIEW)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await acknowledgeAlert(alertId, session.user.id, note);
      await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: auditAction("ACKNOWLEDGED"), resourceType: "clinical_alert", resourceId: alertId, newValues: { note } });
      break;

    case "dismiss":
      if (!hasPermission(session, PERMISSIONS.CLINICAL_ALERT_ACKNOWLEDGE) && !hasPermission(session, PERMISSIONS.CDSS_VIEW)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await dismissAlert(alertId, session.user.id);
      await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: auditAction("DISMISSED"), resourceType: "clinical_alert", resourceId: alertId });
      break;

    case "override":
      if (!hasPermission(session, PERMISSIONS.CLINICAL_ALERT_OVERRIDE)) {
        return NextResponse.json({ error: "Forbidden — override requires clinical_alert.override permission" }, { status: 403 });
      }
      if (!reason || !reason.trim()) {
        return NextResponse.json({ error: "Override reason is required" }, { status: 400 });
      }
      await overrideAlert(alertId, session.user.id, reason);
      await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: auditAction("OVERRIDDEN"), resourceType: "clinical_alert", resourceId: alertId, newValues: { reason } });
      break;

    case "escalate":
      if (!hasPermission(session, PERMISSIONS.CLINICAL_ALERT_ESCALATE)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await escalateAlert(alertId, session.user.id);
      await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: auditAction("ESCALATED"), resourceType: "clinical_alert", resourceId: alertId });
      break;

    case "resolve":
      if (!hasPermission(session, PERMISSIONS.CLINICAL_ALERT_ACKNOWLEDGE) && !hasPermission(session, PERMISSIONS.CDSS_VIEW)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await resolveAlert(alertId, session.user.id);
      await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: auditAction("RESOLVED"), resourceType: "clinical_alert", resourceId: alertId });
      break;

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
