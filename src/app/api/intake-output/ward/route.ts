// =====================================================================
// API: /api/intake-output/ward
//   GET — bulk ward view of I&O monitoring for nursing supervisors
//   Returns per-patient: monitoring status, today's intake/output/net,
//   last entry, missing-entry indicator.
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
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const wardId = url.searchParams.get("wardId");
  if (!facilityId) return NextResponse.json({ error: "facilityId is required" }, { status: 400 });

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  // Active bed assignments for ward (or all wards if wardId not provided)
  const bedAssignWhere: any = { status: "active", facilityId };
  if (wardId) bedAssignWhere.wardId = wardId;

  const assignments = await db.bedAssignment.findMany({
    where: bedAssignWhere,
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true, sex: true, dateOfBirth: true } },
      admission: { select: { id: true, admissionNumber: true, admissionReason: true, admissionDiagnosis: true, admittedAt: true } },
      bed: { select: { id: true, bedNumber: true, bedType: true } },
      ward: { select: { id: true, name: true } },
      room: { select: { id: true, roomNumber: true } },
    },
    orderBy: { assignedAt: "desc" },
    take: 200,
  });

  // For each patient, fetch today's totals + last entry + monitoring period
  const patientIds = assignments.map((a) => a.patientId);
  if (patientIds.length === 0) {
    return NextResponse.json({ items: [], count: 0 });
  }

  const [todayEntries, monitoringPeriods, lastEntriesByPatient] = await Promise.all([
    db.intakeOutputEntry.findMany({
      where: {
        patientId: { in: patientIds },
        status: { not: "cancelled" },
        eventAt: { gte: todayStart, lte: todayEnd },
      },
      select: { patientId: true, entryType: true, amount: true, category: true, fluidType: true },
    }),
    db.intakeOutputMonitoringPeriod.findMany({
      where: { patientId: { in: patientIds }, status: "active" },
      orderBy: { startedAt: "desc" },
    }),
    db.intakeOutputEntry.findMany({
      where: { patientId: { in: patientIds }, status: { not: "cancelled" } },
      orderBy: { eventAt: "desc" },
      distinct: ["patientId"],
      select: { patientId: true, id: true, entryType: true, amount: true, category: true, source: true, eventAt: true },
    }),
  ]);

  const totalsByPatient = new Map<string, { intake: number; output: number; urine: number; drains: number }>();
  for (const e of todayEntries) {
    const cur = totalsByPatient.get(e.patientId) || { intake: 0, output: 0, urine: 0, drains: 0 };
    if (e.entryType === "intake") cur.intake += e.amount;
    else if (e.entryType === "output") {
      cur.output += e.amount;
      if (e.category === "urine" || e.fluidType === "urine") cur.urine += e.amount;
      if (e.category === "drains" || e.fluidType === "drainage") cur.drains += e.amount;
    }
    totalsByPatient.set(e.patientId, cur);
  }
  const periodByPatient = new Map<string, any>();
  for (const p of monitoringPeriods) {
    if (!periodByPatient.has(p.patientId)) periodByPatient.set(p.patientId, p);
  }
  const lastEntryByPatient = new Map<string, any>();
  for (const e of lastEntriesByPatient) {
    if (!lastEntryByPatient.has(e.patientId)) lastEntryByPatient.set(e.patientId, e);
  }

  const items = assignments.map((a) => {
    const totals = totalsByPatient.get(a.patientId);
    const period = periodByPatient.get(a.patientId);
    const lastEntry = lastEntryByPatient.get(a.patientId);
    // Missing-entry indicator: if monitoring period exists with interval > 0
    // and last entry is older than 2x the interval, flag as missing.
    let missingEntry = false;
    let missingSince: string | null = null;
    if (period) {
      const intervalMs = (period.intervalMinutes || 60) * 60 * 1000;
      const cutoff = new Date(Date.now() - intervalMs * 2);
      if (!lastEntry || new Date(lastEntry.eventAt) < cutoff) {
        missingEntry = true;
        missingSince = lastEntry ? lastEntry.eventAt : period.startedAt.toISOString();
      }
    }
    return {
      patientId: a.patientId,
      patient: a.patient,
      admissionId: a.admissionId,
      admission: a.admission,
      ward: a.ward,
      bed: a.bed,
      room: a.room,
      monitoringStatus: period ? "active" : "none",
      monitoringLevel: period?.monitoringLevel || null,
      intervalMinutes: period?.intervalMinutes || null,
      today: {
        intake: totals?.intake || 0,
        output: totals?.output || 0,
        net: (totals?.intake || 0) - (totals?.output || 0),
        urine: totals?.urine || 0,
        drains: totals?.drains || 0,
      },
      lastEntry: lastEntry
        ? {
            id: lastEntry.id,
            entryType: lastEntry.entryType,
            amount: lastEntry.amount,
            category: lastEntry.category,
            source: lastEntry.source,
            eventAt: lastEntry.eventAt,
          }
        : null,
      missingEntry,
      missingSince,
      dailyTargetMl: period?.dailyTargetMl || null,
      dailyLimitMl: period?.dailyLimitMl || null,
    };
  });

  return NextResponse.json({
    items,
    count: items.length,
    summary: {
      totalPatients: items.length,
      monitored: items.filter((i) => i.monitoringStatus === "active").length,
      withMissingEntries: items.filter((i) => i.missingEntry).length,
      totalIntakeToday: items.reduce((s, i) => s + i.today.intake, 0),
      totalOutputToday: items.reduce((s, i) => s + i.today.output, 0),
    },
  });
}
