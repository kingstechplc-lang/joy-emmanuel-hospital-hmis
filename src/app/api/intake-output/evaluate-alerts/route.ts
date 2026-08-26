// =====================================================================
// API: /api/intake-output/evaluate-alerts
//   POST — evaluate all active alert configs against a patient's recent
//          I&O data and raise/update IntakeOutputAlert records.
//
// This is the engine that turns configured thresholds into actual alerts.
// It is:
//   - Called automatically after each POST /api/intake-output (entry recorded)
//   - Callable on-demand (e.g., from a cron job or manual "Re-evaluate" button)
//
// Body: { patientId, admissionId? }
// Returns: { evaluated: number, raised: number, resolved: number, alerts: [...] }
//
// SAFETY: This engine never diagnoses. It only compares documented values
// against configured thresholds and raises informational alerts like
// "Configured threshold reached: urine output <30 ml/h over the last 4h."
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { patientId, admissionId } = body;
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

  const patient = await db.patient.findUnique({ where: { id: patientId }, select: { organizationId: true, firstName: true, lastName: true, patientNumber: true } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  // Find the patient's active monitoring period (for ward scoping)
  const monitoringPeriod = await db.intakeOutputMonitoringPeriod.findFirst({
    where: { patientId, status: "active" },
    orderBy: { startedAt: "desc" },
  });

  // Find the patient's current ward (via active bed assignment)
  let wardId: string | undefined;
  if (admissionId) {
    const bedAssign = await db.bedAssignment.findFirst({
      where: { admissionId, status: "active" },
      select: { wardId: true },
    });
    wardId = bedAssign?.wardId;
  }

  // Load all active alert configs for this facility (or global)
  // We use the facility from the monitoring period if available, else from session
  const facilityId = monitoringPeriod?.facilityId || session.user.facilityId;
  if (!facilityId) {
    return NextResponse.json({ evaluated: 0, raised: 0, resolved: 0, alerts: [], message: "No facility context" });
  }

  const configs = await db.intakeOutputAlertConfig.findMany({
    where: {
      facilityId,
      active: true,
      OR: [
        { wardId: null },
        ...(wardId ? [{ wardId }] : []),
      ],
    },
  });

  if (configs.length === 0) {
    return NextResponse.json({ evaluated: 0, raised: 0, resolved: 0, alerts: [], message: "No active alert configs" });
  }

  // Pull recent entries (last 24h) for evaluation
  const now = new Date();
  const window24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const entries = await db.intakeOutputEntry.findMany({
    where: { patientId, status: { not: "cancelled" }, eventAt: { gte: window24h } },
    orderBy: { eventAt: "desc" },
  });

  // Compute key metrics
  const urineOutput24h = entries
    .filter((e) => e.entryType === "output" && (e.category === "urine" || e.fluidType === "urine"))
    .reduce((s, e) => s + e.amount, 0);
  const urinePerHour = urineOutput24h / 24;

  const totalIntake24h = entries.filter((e) => e.entryType === "intake").reduce((s, e) => s + e.amount, 0);
  const totalOutput24h = entries.filter((e) => e.entryType === "output").reduce((s, e) => s + e.amount, 0);
  const netBalance24h = totalIntake24h - totalOutput24h;

  const drainOutput24h = entries
    .filter((e) => e.entryType === "output" && (e.category === "drains" || e.fluidType === "drainage"))
    .reduce((s, e) => s + e.amount, 0);

  // Missing entries count (from monitoring period)
  let missingCount = 0;
  if (monitoringPeriod) {
    const intervalMin = monitoringPeriod.intervalMinutes || 60;
    const slotCount = Math.floor((24 * 60) / intervalMin);
    for (let i = 0; i < slotCount; i++) {
      const slotStart = new Date(window24h.getTime() + i * intervalMin * 60 * 1000);
      const slotEnd = new Date(slotStart.getTime() + intervalMin * 60 * 1000);
      if (slotStart > now) break;
      const hasEntry = entries.some((e) => { const t = new Date(e.eventAt); return t >= slotStart && t < slotEnd; });
      if (!hasEntry) missingCount++;
    }
  }

  // Weight for mL/kg/h
  const latestVitals = await db.vitalSign.findFirst({
    where: { patientId, weight: { not: null } },
    orderBy: { recordedAt: "desc" },
    select: { weight: true },
  });
  const weightKg = latestVitals?.weight || null;
  const urinePerKgPerHour = weightKg ? urinePerHour / weightKg : null;

  const metrics: Record<string, number> = {
    urine_output_per_hour: urinePerHour,
    urine_output_per_kg_per_hour: urinePerKgPerHour ?? -1, // -1 sentinel if no weight
    urine_output_24h: urineOutput24h,
    net_balance_24h: netBalance24h,
    total_intake_24h: totalIntake24h,
    total_output_24h: totalOutput24h,
    drain_output_24h: drainOutput24h,
    missing_entries: missingCount,
  };

  const results: any[] = [];
  let raised = 0;
  let resolved = 0;

  for (const cfg of configs) {
    const metricValue = metrics[cfg.metric];
    if (metricValue == null || metricValue === -1) {
      // Cannot evaluate (e.g., weight-based metric without weight)
      continue;
    }

    let triggered = false;
    switch (cfg.operator) {
      case "lt": triggered = metricValue < cfg.threshold; break;
      case "gt": triggered = metricValue > cfg.threshold; break;
      case "lte": triggered = metricValue <= cfg.threshold; break;
      case "gte": triggered = metricValue >= cfg.threshold; break;
      case "eq": triggered = metricValue === cfg.threshold; break;
    }

    // Check if there's an existing active alert for this config + patient
    const existing = await db.intakeOutputAlert.findFirst({
      where: { patientId, configId: cfg.id, status: "active" },
    });

    const metricLabel: Record<string, string> = {
      urine_output_per_hour: "Urine output (ml/h)",
      urine_output_per_kg_per_hour: "Urine output (ml/kg/h)",
      urine_output_24h: "Urine output 24h (ml)",
      net_balance_24h: "Net fluid balance 24h (ml)",
      total_intake_24h: "Total intake 24h (ml)",
      total_output_24h: "Total output 24h (ml)",
      drain_output_24h: "Drain output 24h (ml)",
      missing_entries: "Missing documentation slots",
    };

    if (triggered && !existing) {
      // Raise new alert
      const title = `${cfg.name}`;
      const message = `Configured threshold reached: ${metricLabel[cfg.metric] || cfg.metric} ${cfg.operator} ${cfg.threshold} (actual: ${metricValue.toFixed(metricValue < 10 ? 2 : 0)}).`;
      const alert = await db.intakeOutputAlert.create({
        data: {
          organizationId: session.user.organizationId,
          facilityId,
          patientId,
          admissionId: admissionId || null,
          configId: cfg.id,
          code: cfg.code,
          severity: cfg.severity,
          title,
          message,
          metric: cfg.metric,
          thresholdValue: cfg.threshold,
          actualValue: metricValue,
        },
      });
      results.push(alert);
      raised++;

      await auditLog({
        userId: session.user.id,
        organizationId: session.user.organizationId,
        facilityId,
        action: "INTAKE_OUTPUT_ALERT_RAISED",
        resourceType: "intake_output_alert",
        resourceId: alert.id,
        newValues: { patientId, code: cfg.code, severity: cfg.severity, metric: cfg.metric, threshold: cfg.threshold, actual: metricValue },
      });
    } else if (!triggered && existing) {
      // Auto-resolve
      await db.intakeOutputAlert.update({
        where: { id: existing.id },
        data: { status: "resolved" },
      });
      resolved++;
    }
  }

  return NextResponse.json({
    evaluated: configs.length,
    raised,
    resolved,
    alerts: results,
    metrics: {
      urineOutput24h,
      urinePerHour,
      urinePerKgPerHour,
      netBalance24h,
      missingCount,
      weightKg,
    },
  });
}
