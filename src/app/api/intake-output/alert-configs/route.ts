// =====================================================================
// API: /api/intake-output/alert-configs
//   GET    — list alert configs for a facility
//   POST   — create a new alert config
//   PATCH  — update an existing config (toggle active, change threshold, etc.)
//   DELETE — deactivate (soft delete) a config
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_CODES = ["missing_entry", "low_urine", "negative_balance", "positive_balance", "high_output", "documented_change"];
const VALID_METRICS = ["urine_output_per_hour", "urine_output_per_kg_per_hour", "urine_output_24h", "net_balance_24h", "total_intake_24h", "total_output_24h", "drain_output_24h", "missing_entries"];
const VALID_OPERATORS = ["lt", "gt", "lte", "gte", "eq"];
const VALID_SEVERITIES = ["info", "warning", "critical"];

// GET /api/intake-output/alert-configs?facilityId=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  if (!facilityId) return NextResponse.json({ error: "facilityId is required" }, { status: 400 });

  const configs = await db.intakeOutputAlertConfig.findMany({
    where: { facilityId },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      ward: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ items: configs, count: configs.length });
}

// POST — create new config
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { facilityId, name, code, metric, operator, threshold, windowMinutes, patientGroup, wardId, severity, recipients, active, notes } = body;
  if (!facilityId || !name || !code || !metric || !operator || threshold == null) {
    return NextResponse.json({ error: "facilityId, name, code, metric, operator, threshold are required" }, { status: 400 });
  }
  if (!VALID_CODES.includes(code)) return NextResponse.json({ error: `code must be one of: ${VALID_CODES.join(", ")}` }, { status: 400 });
  if (!VALID_METRICS.includes(metric)) return NextResponse.json({ error: `metric must be one of: ${VALID_METRICS.join(", ")}` }, { status: 400 });
  if (!VALID_OPERATORS.includes(operator)) return NextResponse.json({ error: `operator must be one of: ${VALID_OPERATORS.join(", ")}` }, { status: 400 });
  if (severity && !VALID_SEVERITIES.includes(severity)) return NextResponse.json({ error: `severity must be one of: ${VALID_SEVERITIES.join(", ")}` }, { status: 400 });

  const facility = await db.facility.findUnique({ where: { id: facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  }

  const config = await db.intakeOutputAlertConfig.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId,
      name,
      code,
      metric,
      operator,
      threshold: Number(threshold),
      windowMinutes: Number(windowMinutes) || 1440,
      patientGroup: patientGroup || "all",
      wardId: wardId || null,
      severity: severity || "warning",
      recipients: recipients ? JSON.stringify(recipients) : null,
      active: active !== false,
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "INTAKE_OUTPUT_ALERT_CONFIG_CREATED",
    resourceType: "intake_output_alert_config",
    resourceId: config.id,
    newValues: { name, code, metric, operator, threshold, severity },
  });

  return NextResponse.json({ item: config }, { status: 201 });
}

// PATCH — update config
// body: { configId, name?, threshold?, operator?, severity?, active?, windowMinutes?, patientGroup?, wardId?, recipients? }
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { configId, name, threshold, operator, severity, active, windowMinutes, patientGroup, wardId, recipients } = body;
  if (!configId) return NextResponse.json({ error: "configId is required" }, { status: 400 });

  const existing = await db.intakeOutputAlertConfig.findUnique({ where: { id: configId } });
  if (!existing) return NextResponse.json({ error: "Config not found" }, { status: 404 });
  if (existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (operator && !VALID_OPERATORS.includes(operator)) return NextResponse.json({ error: `operator must be one of: ${VALID_OPERATORS.join(", ")}` }, { status: 400 });
  if (severity && !VALID_SEVERITIES.includes(severity)) return NextResponse.json({ error: `severity must be one of: ${VALID_SEVERITIES.join(", ")}` }, { status: 400 });

  const updated = await db.intakeOutputAlertConfig.update({
    where: { id: configId },
    data: {
      name: name ?? existing.name,
      threshold: threshold != null ? Number(threshold) : existing.threshold,
      operator: operator || existing.operator,
      severity: severity || existing.severity,
      active: active != null ? active : existing.active,
      windowMinutes: windowMinutes != null ? Number(windowMinutes) : existing.windowMinutes,
      patientGroup: patientGroup ?? existing.patientGroup,
      wardId: wardId !== undefined ? (wardId || null) : existing.wardId,
      recipients: recipients !== undefined ? (recipients ? JSON.stringify(recipients) : null) : existing.recipients,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "INTAKE_OUTPUT_ALERT_CONFIG_UPDATED",
    resourceType: "intake_output_alert_config",
    resourceId: configId,
    oldValues: { name: existing.name, threshold: existing.threshold, operator: existing.operator, active: existing.active },
    newValues: { name: updated.name, threshold: updated.threshold, operator: updated.operator, active: updated.active },
  });

  return NextResponse.json({ item: updated });
}

// DELETE — soft delete (deactivate)
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const configId = url.searchParams.get("configId");
  if (!configId) return NextResponse.json({ error: "configId is required" }, { status: 400 });

  const existing = await db.intakeOutputAlertConfig.findUnique({ where: { id: configId } });
  if (!existing) return NextResponse.json({ error: "Config not found" }, { status: 404 });
  if (existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.intakeOutputAlertConfig.update({
    where: { id: configId },
    data: { active: false },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId,
    action: "INTAKE_OUTPUT_ALERT_CONFIG_DEACTIVATED",
    resourceType: "intake_output_alert_config",
    resourceId: configId,
  });

  return NextResponse.json({ success: true });
}
