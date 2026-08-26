// =====================================================================
// API: /api/intake-output/handover
//   GET — generate a nursing shift handover summary for a ward or patient.
//
// Query params:
//   facilityId = facility scope (required)
//   wardId     = ward scope (optional — omit for whole facility)
//   patientId  = single-patient handover (optional)
//
// Returns per-patient:
//   - Bed, admission, monitoring status
//   - Current shift intake/output/net
//   - 24h urine, drains, NG losses
//   - Active alerts
//   - Last entry
//   - Outstanding monitoring (missing slots)
//   - Documented targets / restrictions
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
  const patientId = url.searchParams.get("patientId");
  if (!facilityId) return NextResponse.json({ error: "facilityId is required" }, { status: 400 });

  const now = new Date();
  // Current shift: simple heuristic — morning 07-15, evening 15-23, night 23-07
  const hour = now.getHours();
  let shiftName = "night";
  let shiftStart = new Date(now);
  let shiftEnd = new Date(now);
  if (hour >= 7 && hour < 15) {
    shiftName = "morning";
    shiftStart.setHours(7, 0, 0, 0);
    shiftEnd.setHours(15, 0, 0, 0);
  } else if (hour >= 15 && hour < 23) {
    shiftName = "evening";
    shiftStart.setHours(15, 0, 0, 0);
    shiftEnd.setHours(23, 0, 0, 0);
  } else {
    shiftName = "night";
    if (hour >= 23) {
      shiftStart.setHours(23, 0, 0, 0);
      shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
      shiftEnd.setHours(7, 0, 0, 0);
    } else {
      shiftEnd.setHours(7, 0, 0, 0);
      shiftStart = new Date(shiftStart.getTime() - 24 * 60 * 60 * 1000);
      shiftStart.setHours(23, 0, 0, 0);
    }
  }

  const rolling24Start = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Patient scope
  let patientIds: string[] = [];
  if (patientId) {
    patientIds = [patientId];
  } else {
    const bedAssignWhere: any = { status: "active", facilityId };
    if (wardId) bedAssignWhere.wardId = wardId;
    const assignments = await db.bedAssignment.findMany({
      where: bedAssignWhere,
      select: { patientId: true },
      take: 200,
    });
    patientIds = assignments.map((a) => a.patientId);
  }

  if (patientIds.length === 0) {
    return NextResponse.json({
      shiftName,
      shiftStart,
      shiftEnd,
      items: [],
      summary: { totalPatients: 0 },
    });
  }

  // Fetch all data in parallel
  const [assignments, shiftEntries, rolling24Entries, monitoringPeriods, activeAlerts, lastEntries] = await Promise.all([
    db.bedAssignment.findMany({
      where: { status: "active", facilityId, patientId: { in: patientIds }, ...(wardId ? { wardId } : {}) },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true, sex: true, dateOfBirth: true } },
        admission: { select: { id: true, admissionNumber: true, admissionReason: true, admissionDiagnosis: true, admittedAt: true } },
        bed: { select: { bedNumber: true } },
        ward: { select: { id: true, name: true } },
        room: { select: { roomNumber: true } },
      },
      take: 200,
    }),
    db.intakeOutputEntry.findMany({
      where: { patientId: { in: patientIds }, status: { not: "cancelled" }, eventAt: { gte: shiftStart, lte: shiftEnd } },
      select: { patientId: true, entryType: true, amount: true, category: true, fluidType: true, source: true, route: true, eventAt: true },
    }),
    db.intakeOutputEntry.findMany({
      where: { patientId: { in: patientIds }, status: { not: "cancelled" }, eventAt: { gte: rolling24Start, lte: now } },
      select: { patientId: true, entryType: true, amount: true, category: true, fluidType: true, source: true, route: true, eventAt: true },
    }),
    db.intakeOutputMonitoringPeriod.findMany({
      where: { patientId: { in: patientIds }, status: "active" },
      orderBy: { startedAt: "desc" },
    }),
    db.intakeOutputAlert.findMany({
      where: { patientId: { in: patientIds }, status: "active" },
      orderBy: { raisedAt: "desc" },
    }),
    db.intakeOutputEntry.findMany({
      where: { patientId: { in: patientIds }, status: { not: "cancelled" } },
      orderBy: { eventAt: "desc" },
      distinct: ["patientId"],
      select: { patientId: true, id: true, entryType: true, amount: true, category: true, source: true, eventAt: true },
    }),
  ]);

  // Build per-patient summary
  const shiftByPatient = new Map<string, any>();
  for (const e of shiftEntries) {
    if (!shiftByPatient.has(e.patientId)) shiftByPatient.set(e.patientId, { intake: 0, output: 0, urine: 0, drains: 0, ng: 0, vomit: 0, entries: [] });
    const s = shiftByPatient.get(e.patientId);
    if (e.entryType === "intake") s.intake += e.amount;
    else {
      s.output += e.amount;
      if (e.category === "urine" || e.fluidType === "urine") s.urine += e.amount;
      if (e.category === "drains" || e.fluidType === "drainage") s.drains += e.amount;
      if (e.route === "ng" || (e.source || "").toLowerCase().includes("ng")) s.ng += e.amount;
      if ((e.source || "").toLowerCase().includes("vomit") || (e.source || "").toLowerCase().includes("emesis")) s.vomit += e.amount;
    }
    s.entries.push(e);
  }

  const rollingByPatient = new Map<string, any>();
  for (const e of rolling24Entries) {
    if (!rollingByPatient.has(e.patientId)) rollingByPatient.set(e.patientId, { intake: 0, output: 0, urine: 0, drains: 0, ng: 0, vomit: 0 });
    const r = rollingByPatient.get(e.patientId);
    if (e.entryType === "intake") r.intake += e.amount;
    else {
      r.output += e.amount;
      if (e.category === "urine" || e.fluidType === "urine") r.urine += e.amount;
      if (e.category === "drains" || e.fluidType === "drainage") r.drains += e.amount;
      if (e.route === "ng" || (e.source || "").toLowerCase().includes("ng")) r.ng += e.amount;
      if ((e.source || "").toLowerCase().includes("vomit") || (e.source || "").toLowerCase().includes("emesis")) r.vomit += e.amount;
    }
  }

  const periodByPatient = new Map<string, any>();
  for (const p of monitoringPeriods) if (!periodByPatient.has(p.patientId)) periodByPatient.set(p.patientId, p);

  const alertsByPatient = new Map<string, any[]>();
  for (const a of activeAlerts) {
    if (!alertsByPatient.has(a.patientId)) alertsByPatient.set(a.patientId, []);
    alertsByPatient.get(a.patientId)!.push(a);
  }

  const lastEntryByPatient = new Map<string, any>();
  for (const e of lastEntries) if (!lastEntryByPatient.has(e.patientId)) lastEntryByPatient.set(e.patientId, e);

  const items = assignments.map((a) => {
    const shift = shiftByPatient.get(a.patientId) || { intake: 0, output: 0, urine: 0, drains: 0, ng: 0, vomit: 0, entries: [] };
    const rolling = rollingByPatient.get(a.patientId) || { intake: 0, output: 0, urine: 0, drains: 0, ng: 0, vomit: 0 };
    const period = periodByPatient.get(a.patientId);
    const alerts = alertsByPatient.get(a.patientId) || [];
    const lastEntry = lastEntryByPatient.get(a.patientId);

    // Missing slots
    let missingSlots = 0;
    if (period) {
      const intervalMin = period.intervalMinutes || 60;
      const slotCount = Math.floor((24 * 60) / intervalMin);
      const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const patient24hEntries = rolling24Entries.filter((e) => e.patientId === a.patientId);
      for (let i = 0; i < slotCount; i++) {
        const slotStart = new Date(windowStart.getTime() + i * intervalMin * 60 * 1000);
        const slotEnd = new Date(slotStart.getTime() + intervalMin * 60 * 1000);
        if (slotStart > now) break;
        const hasEntry = patient24hEntries.some((e) => { const t = new Date(e.eventAt); return t >= slotStart && t < slotEnd; });
        if (!hasEntry) missingSlots++;
      }
    }

    return {
      patientId: a.patientId,
      patient: a.patient,
      admission: a.admission,
      ward: a.ward,
      bed: a.bed,
      room: a.room,
      shift: {
        name: shiftName,
        start: shiftStart,
        end: shiftEnd,
        intake: shift.intake,
        output: shift.output,
        net: shift.intake - shift.output,
        urine: shift.urine,
        drains: shift.drains,
        ng: shift.ng,
        vomit: shift.vomit,
        entryCount: shift.entries.length,
      },
      rolling24h: {
        intake: rolling.intake,
        output: rolling.output,
        net: rolling.intake - rolling.output,
        urine: rolling.urine,
        urinePerHour: rolling.urine / 24,
        drains: rolling.drains,
        ng: rolling.ng,
        vomit: rolling.vomit,
      },
      monitoring: period ? {
        active: true,
        level: period.monitoringLevel,
        intervalMinutes: period.intervalMinutes,
        dailyTargetMl: period.dailyTargetMl,
        dailyLimitMl: period.dailyLimitMl,
        startedAt: period.startedAt,
      } : { active: false },
      alerts,
      lastEntry: lastEntry ? {
        entryType: lastEntry.entryType,
        amount: lastEntry.amount,
        category: lastEntry.category,
        source: lastEntry.source,
        eventAt: lastEntry.eventAt,
      } : null,
      missingSlots,
    };
  });

  return NextResponse.json({
    shiftName,
    shiftStart,
    shiftEnd,
    generatedAt: now,
    items,
    summary: {
      totalPatients: items.length,
      monitored: items.filter((i) => i.monitoring.active).length,
      withAlerts: items.filter((i) => i.alerts.length > 0).length,
      withMissingEntries: items.filter((i) => i.missingSlots > 0).length,
      shiftTotalIntake: items.reduce((s, i) => s + i.shift.intake, 0),
      shiftTotalOutput: items.reduce((s, i) => s + i.shift.output, 0),
      rolling24hTotalIntake: items.reduce((s, i) => s + i.rolling24h.intake, 0),
      rolling24hTotalOutput: items.reduce((s, i) => s + i.rolling24h.output, 0),
    },
  });
}
