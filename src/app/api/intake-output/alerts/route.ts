// =====================================================================
// API: /api/intake-output/alerts
//   GET    — list alerts (facility-wide or per-patient)
//   PATCH  — acknowledge an alert (action taken + notes)
//
// NOTE: Alert generation is done by a separate evaluation pass — either
// triggered inline by POST /api/intake-output after each entry, or by
// a scheduled job. This endpoint surfaces and acknowledges alerts.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/intake-output/alerts?patientId=...&status=active&facilityId=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const status = url.searchParams.get("status"); // active | acknowledged | resolved
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const severity = url.searchParams.get("severity");
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (patientId) where.patientId = patientId;
  if (status) where.status = status;
  if (severity) where.severity = severity;

  const alerts = await db.intakeOutputAlert.findMany({
    where,
    orderBy: { raisedAt: "desc" },
    take: limit,
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } },
      acknowledgedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });
  return NextResponse.json({ items: alerts, count: alerts.length });
}

// PATCH — acknowledge an alert
// body: { alertId, actionTaken, notes }
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { alertId, actionTaken, notes } = body;
  if (!alertId) return NextResponse.json({ error: "alertId is required" }, { status: 400 });

  const alert = await db.intakeOutputAlert.findUnique({ where: { id: alertId } });
  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

  if (alert.status === "acknowledged") {
    return NextResponse.json({ error: "Alert already acknowledged" }, { status: 400 });
  }

  const updated = await db.intakeOutputAlert.update({
    where: { id: alertId },
    data: {
      status: "acknowledged",
      acknowledgedById: session.user.id,
      acknowledgedAt: new Date(),
      actionTaken: actionTaken || null,
      ackNotes: notes || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: alert.facilityId,
    action: "INTAKE_OUTPUT_ALERT_ACKNOWLEDGED",
    resourceType: "intake_output_alert",
    resourceId: alert.id,
    oldValues: { status: alert.status },
    newValues: { status: "acknowledged", actionTaken, notes },
  });

  return NextResponse.json({ item: updated });
}
