// =====================================================================
// API: /api/intake-output/monitoring
//   GET    — list monitoring periods for a patient
//   POST   — start a new monitoring period (with optional fluid target / restriction)
//   PATCH  — end a monitoring period or update targets
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_LEVELS = ["standard", "enhanced", "intensive"];
const VALID_INTERVALS = [15, 30, 60, 120, 240, 480, 720, 1440];

// GET /api/intake-output/monitoring?patientId=...&status=active
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const status = url.searchParams.get("status"); // active | ended
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

  const patient = await db.patient.findUnique({ where: { id: patientId }, select: { organizationId: true } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  const where: any = { patientId };
  if (status) where.status = status;

  const periods = await db.intakeOutputMonitoringPeriod.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ items: periods, count: periods.length });
}

// POST — start new monitoring period
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { patientId, admissionId, encounterId, facilityId, monitoringLevel, intervalMinutes, shiftDefinition, dailyTargetMl, dailyLimitMl, targetSource, notes } = body;

  if (!patientId || !facilityId) return NextResponse.json({ error: "patientId, facilityId are required" }, { status: 400 });
  if (monitoringLevel && !VALID_LEVELS.includes(monitoringLevel)) {
    return NextResponse.json({ error: `monitoringLevel must be one of: ${VALID_LEVELS.join(", ")}` }, { status: 400 });
  }
  if (intervalMinutes && !VALID_INTERVALS.includes(Number(intervalMinutes))) {
    return NextResponse.json({ error: `intervalMinutes must be one of: ${VALID_INTERVALS.join(", ")}` }, { status: 400 });
  }

  const patient = await db.patient.findUnique({ where: { id: patientId }, select: { organizationId: true } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  // End any existing active period for this patient
  const existing = await db.intakeOutputMonitoringPeriod.findFirst({ where: { patientId, status: "active" } });
  if (existing) {
    await db.intakeOutputMonitoringPeriod.update({
      where: { id: existing.id },
      data: { status: "ended", endedAt: new Date(), endedById: session.user.id },
    });
  }

  const period = await db.intakeOutputMonitoringPeriod.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId,
      patientId,
      admissionId: admissionId || null,
      encounterId: encounterId || null,
      monitoringLevel: monitoringLevel || "standard",
      intervalMinutes: Number(intervalMinutes) || 60,
      shiftDefinition: shiftDefinition ? JSON.stringify(shiftDefinition) : null,
      dailyTargetMl: dailyTargetMl ? Number(dailyTargetMl) : null,
      dailyLimitMl: dailyLimitMl ? Number(dailyLimitMl) : null,
      targetSource: targetSource || null,
      startedById: session.user.id,
      notes: notes || null,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "INTAKE_OUTPUT_MONITORING_STARTED",
    resourceType: "intake_output_monitoring_period",
    resourceId: period.id,
    newValues: { patientId, admissionId, monitoringLevel: period.monitoringLevel, intervalMinutes: period.intervalMinutes, dailyTargetMl: period.dailyTargetMl, dailyLimitMl: period.dailyLimitMl },
  });

  return NextResponse.json({ item: period }, { status: 201 });
}

// PATCH — end monitoring period or update targets
// body: { periodId, action: "end" | "update", dailyTargetMl?, dailyLimitMl?, monitoringLevel?, intervalMinutes?, notes? }
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { periodId, action, dailyTargetMl, dailyLimitMl, monitoringLevel, intervalMinutes, notes } = body;
  if (!periodId || !action) return NextResponse.json({ error: "periodId, action are required" }, { status: 400 });

  const period = await db.intakeOutputMonitoringPeriod.findUnique({ where: { id: periodId } });
  if (!period) return NextResponse.json({ error: "Monitoring period not found" }, { status: 404 });

  let updated: any;
  if (action === "end") {
    updated = await db.intakeOutputMonitoringPeriod.update({
      where: { id: periodId },
      data: { status: "ended", endedAt: new Date(), endedById: session.user.id, notes: notes ?? period.notes },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: period.facilityId,
      action: "INTAKE_OUTPUT_MONITORING_ENDED",
      resourceType: "intake_output_monitoring_period",
      resourceId: period.id,
      oldValues: { status: period.status },
      newValues: { status: "ended", endedAt: updated.endedAt },
    });
  } else if (action === "update") {
    updated = await db.intakeOutputMonitoringPeriod.update({
      where: { id: periodId },
      data: {
        dailyTargetMl: dailyTargetMl != null ? Number(dailyTargetMl) : period.dailyTargetMl,
        dailyLimitMl: dailyLimitMl != null ? Number(dailyLimitMl) : period.dailyLimitMl,
        monitoringLevel: monitoringLevel || period.monitoringLevel,
        intervalMinutes: intervalMinutes ? Number(intervalMinutes) : period.intervalMinutes,
        notes: notes ?? period.notes,
      },
    });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      facilityId: period.facilityId,
      action: "INTAKE_OUTPUT_MONITORING_UPDATED",
      resourceType: "intake_output_monitoring_period",
      resourceId: period.id,
      oldValues: { dailyTargetMl: period.dailyTargetMl, dailyLimitMl: period.dailyLimitMl, monitoringLevel: period.monitoringLevel },
      newValues: { dailyTargetMl: updated.dailyTargetMl, dailyLimitMl: updated.dailyLimitMl, monitoringLevel: updated.monitoringLevel },
    });
  } else {
    return NextResponse.json({ error: "action must be end or update" }, { status: 400 });
  }

  return NextResponse.json({ item: updated });
}
