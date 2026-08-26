// =====================================================================
// API: /api/intake-output/reports
//   GET — generate a fluid balance report
//
// Query params:
//   type       = daily | shift | rolling24h | patient | ward | urine | drain | missing | trend | audit
//   patientId  = (for patient-scoped reports)
//   admissionId = (for admission-scoped reports)
//   facilityId = (for facility-scoped reports)
//   wardId     = (for ward-scoped reports)
//   date       = YYYY-MM-DD (for daily/shift reports)
//   from       = YYYY-MM-DD (for range reports)
//   to         = YYYY-MM-DD (for range reports)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hourKey(d: Date) {
  return `${dateKey(d)} ${String(d.getHours()).padStart(2, "0")}:00`;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "daily";
  const patientId = url.searchParams.get("patientId");
  const admissionId = url.searchParams.get("admissionId");
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const wardId = url.searchParams.get("wardId");
  const date = url.searchParams.get("date") || dateKey(new Date());
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  // ---- DAILY report (single-day) ----
  if (type === "daily") {
    if (!patientId) return NextResponse.json({ error: "patientId is required for daily report" }, { status: 400 });
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59.999`);
    const entries = await db.intakeOutputEntry.findMany({
      where: { patientId, status: { not: "cancelled" }, eventAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { eventAt: "asc" },
      include: {
        recordedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
        verifiedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      },
    });
    const intake = entries.filter((e) => e.entryType === "intake").reduce((s, e) => s + e.amount, 0);
    const output = entries.filter((e) => e.entryType === "output").reduce((s, e) => s + e.amount, 0);
    const urine = entries.filter((e) => e.entryType === "output" && (e.category === "urine" || e.fluidType === "urine")).reduce((s, e) => s + e.amount, 0);
    const drains = entries.filter((e) => e.entryType === "output" && (e.category === "drains" || e.fluidType === "drainage")).reduce((s, e) => s + e.amount, 0);

    // Hourly breakdown
    const hourlyMap = new Map<string, { intake: number; output: number; entries: number }>();
    for (const e of entries) {
      const k = hourKey(new Date(e.eventAt));
      const cur = hourlyMap.get(k) || { intake: 0, output: 0, entries: 0 };
      if (e.entryType === "intake") cur.intake += e.amount;
      else cur.output += e.amount;
      cur.entries += 1;
      hourlyMap.set(k, cur);
    }
    const [y, m, d] = date.split("-").map(Number);
    const hourly: any[] = [];
    for (let h = 0; h < 24; h++) {
      const dt = new Date(y, m - 1, d, h, 0, 0);
      const k = hourKey(dt);
      const rec = hourlyMap.get(k);
      hourly.push({
        hour: String(h).padStart(2, "0") + ":00",
        intake: rec?.intake || null,
        output: rec?.output || null,
        net: rec ? rec.intake - rec.output : null,
        missing: !rec,
      });
    }

    const patient = await db.patient.findUnique({ where: { id: patientId }, select: { id: true, firstName: true, lastName: true, patientNumber: true, sex: true, dateOfBirth: true } });
    const adm = admissionId ? await db.admission.findUnique({ where: { id: admissionId }, select: { id: true, admissionNumber: true, admittedAt: true, bedAssignments: { where: { status: "active" }, take: 1, include: { ward: true, bed: true, room: true } } } }) : null;

    return NextResponse.json({
      type: "daily",
      date,
      patient,
      admission: adm,
      summary: { intake, output, net: intake - output, urine, drains, entryCount: entries.length, recordedHours: hourly.filter((h) => !h.missing).length, missingHours: hourly.filter((h) => h.missing).length },
      hourly,
      entries,
    });
  }

  // ---- SHIFT report ----
  if (type === "shift") {
    if (!patientId) return NextResponse.json({ error: "patientId is required for shift report" }, { status: 400 });
    const period = await db.intakeOutputMonitoringPeriod.findFirst({ where: { patientId, status: "active" }, orderBy: { startedAt: "desc" } });
    const shiftDef = period?.shiftDefinition ? JSON.parse(period.shiftDefinition) : { morning: { start: "07:00", end: "15:00" }, evening: { start: "15:00", end: "23:00" }, night: { start: "23:00", end: "07:00" } };
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59.999`);
    const entries = await db.intakeOutputEntry.findMany({ where: { patientId, status: { not: "cancelled" }, eventAt: { gte: dayStart, lte: dayEnd } }, orderBy: { eventAt: "asc" } });

    const shiftTotals: any[] = [];
    for (const [name, def] of Object.entries(shiftDef)) {
      const [sh, sm] = (def as any).start.split(":").map(Number);
      const [eh, em] = (def as any).end.split(":").map(Number);
      let startDt = new Date(dayStart); startDt.setHours(sh, sm, 0, 0);
      let endDt = new Date(dayStart); endDt.setHours(eh, em, 0, 0);
      if (endDt <= startDt) endDt = new Date(endDt.getTime() + 24 * 60 * 60 * 1000);
      const shiftEntries = entries.filter((e) => { const t = new Date(e.eventAt); return t >= startDt && t < endDt; });
      const intake = shiftEntries.filter((e) => e.entryType === "intake").reduce((s, e) => s + e.amount, 0);
      const output = shiftEntries.filter((e) => e.entryType === "output").reduce((s, e) => s + e.amount, 0);
      shiftTotals.push({ shift: name, start: (def as any).start, end: (def as any).end, intake, output, net: intake - output, entryCount: shiftEntries.length });
    }

    return NextResponse.json({ type: "shift", date, patientId, shiftTotals, entries });
  }

  // ---- ROLLING 24H ----
  if (type === "rolling24h") {
    if (!patientId) return NextResponse.json({ error: "patientId is required for rolling24h report" }, { status: 400 });
    const end = to ? new Date(to) : new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const entries = await db.intakeOutputEntry.findMany({ where: { patientId, status: { not: "cancelled" }, eventAt: { gte: start, lte: end } }, orderBy: { eventAt: "asc" } });
    const intake = entries.filter((e) => e.entryType === "intake").reduce((s, e) => s + e.amount, 0);
    const output = entries.filter((e) => e.entryType === "output").reduce((s, e) => s + e.amount, 0);
    return NextResponse.json({ type: "rolling24h", start, end, summary: { intake, output, net: intake - output }, entries });
  }

  // ---- PATIENT (admission-scoped) ----
  if (type === "patient") {
    if (!patientId) return NextResponse.json({ error: "patientId is required for patient report" }, { status: 400 });
    const adm = admissionId ? await db.admission.findUnique({ where: { id: admissionId } }) : null;
    const startBoundary = adm?.admittedAt || (from ? new Date(`${from}T00:00:00`) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const endBoundary = adm?.dischargedAt || (to ? new Date(`${to}T23:59:59.999`) : new Date());
    const entries = await db.intakeOutputEntry.findMany({ where: { patientId, status: { not: "cancelled" }, eventAt: { gte: startBoundary, lte: endBoundary } }, orderBy: { eventAt: "asc" }, include: { recordedBy: { select: { firstName: true, lastName: true, username: true } }, verifiedBy: { select: { firstName: true, lastName: true, username: true } } } });

    // Daily cumulative
    const byDay = new Map<string, { intake: number; output: number }>();
    for (const e of entries) {
      const k = dateKey(new Date(e.eventAt));
      const cur = byDay.get(k) || { intake: 0, output: 0 };
      if (e.entryType === "intake") cur.intake += e.amount;
      else cur.output += e.amount;
      byDay.set(k, cur);
    }
    const dailyCumulative: any[] = [];
    let running = 0;
    for (const [dt, t] of Array.from(byDay.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      running += t.intake - t.output;
      dailyCumulative.push({ date: dt, intake: t.intake, output: t.output, net: t.intake - t.output, cumulative: running });
    }
    const totalIntake = dailyCumulative.reduce((s, t) => s + t.intake, 0);
    const totalOutput = dailyCumulative.reduce((s, t) => s + t.output, 0);

    return NextResponse.json({
      type: "patient",
      patientId,
      admission: adm,
      start: startBoundary,
      end: endBoundary,
      summary: { totalIntake, totalOutput, netBalance: totalIntake - totalOutput, cumulative: running, dayCount: dailyCumulative.length, entryCount: entries.length },
      dailyCumulative,
      entries,
    });
  }

  // ---- WARD ----
  if (type === "ward") {
    if (!facilityId) return NextResponse.json({ error: "facilityId is required for ward report" }, { status: 400 });
    const bedAssignWhere: any = { status: "active", facilityId };
    if (wardId) bedAssignWhere.wardId = wardId;
    const assignments = await db.bedAssignment.findMany({
      where: bedAssignWhere,
      include: { patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true, sex: true, dateOfBirth: true } }, admission: { select: { id: true, admissionNumber: true, admissionReason: true } }, bed: { select: { bedNumber: true } }, ward: { select: { id: true, name: true } } },
      take: 200,
    });
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const patientIds = assignments.map((a) => a.patientId);
    const entries = patientIds.length === 0 ? [] : await db.intakeOutputEntry.findMany({ where: { patientId: { in: patientIds }, status: { not: "cancelled" }, eventAt: { gte: todayStart, lte: todayEnd } }, select: { patientId: true, entryType: true, amount: true } });
    const totals = new Map<string, { intake: number; output: number }>();
    for (const e of entries) {
      const cur = totals.get(e.patientId) || { intake: 0, output: 0 };
      if (e.entryType === "intake") cur.intake += e.amount;
      else cur.output += e.amount;
      totals.set(e.patientId, cur);
    }
    const items = assignments.map((a) => {
      const t = totals.get(a.patientId) || { intake: 0, output: 0 };
      return { patientId: a.patientId, patient: a.patient, admission: a.admission, ward: a.ward, bed: a.bed, todayIntake: t.intake, todayOutput: t.output, todayNet: t.intake - t.output, missing: t.intake === 0 && t.output === 0 };
    });
    return NextResponse.json({ type: "ward", facilityId, wardId, date: dateKey(new Date()), items, summary: { totalPatients: items.length, withEntries: items.filter((i) => !i.missing).length, missing: items.filter((i) => i.missing).length, totalIntake: items.reduce((s, i) => s + i.todayIntake, 0), totalOutput: items.reduce((s, i) => s + i.todayOutput, 0) } });
  }

  // ---- URINE ----
  if (type === "urine") {
    if (!patientId) return NextResponse.json({ error: "patientId is required for urine report" }, { status: 400 });
    const start = from ? new Date(`${from}T00:00:00`) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    const entries = await db.intakeOutputEntry.findMany({ where: { patientId, status: { not: "cancelled" }, entryType: "output", eventAt: { gte: start, lte: end }, OR: [{ category: "urine" }, { fluidType: "urine" }] }, orderBy: { eventAt: "asc" } });
    const totalUrine = entries.reduce((s, e) => s + e.amount, 0);
    const hours = Math.max(1, (end.getTime() - start.getTime()) / (60 * 60 * 1000));
    const latestVitals = await db.vitalSign.findFirst({ where: { patientId, weight: { not: null } }, orderBy: { recordedAt: "desc" }, select: { weight: true, recordedAt: true } });
    return NextResponse.json({
      type: "urine",
      patientId,
      start,
      end,
      summary: {
        totalUrine,
        urinePerHour: totalUrine / hours,
        urinePerKgPerHour: latestVitals?.weight ? totalUrine / hours / latestVitals.weight : null,
        weightKg: latestVitals?.weight || null,
        weightSource: latestVitals ? { recordedAt: latestVitals.recordedAt } : null,
        entryCount: entries.length,
        windowHours: hours,
      },
      entries,
    });
  }

  // ---- DRAIN ----
  if (type === "drain") {
    if (!patientId) return NextResponse.json({ error: "patientId is required for drain report" }, { status: 400 });
    const start = from ? new Date(`${from}T00:00:00`) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    const entries = await db.intakeOutputEntry.findMany({ where: { patientId, status: { not: "cancelled" }, entryType: "output", eventAt: { gte: start, lte: end }, OR: [{ category: "drains" }, { fluidType: "drainage" }] }, orderBy: { eventAt: "asc" } });
    const byDrain = new Map<string, number>();
    for (const e of entries) {
      const label = e.drainLabel || "Unlabeled";
      byDrain.set(label, (byDrain.get(label) || 0) + e.amount);
    }
    return NextResponse.json({ type: "drain", patientId, start, end, summary: { totalDrainOutput: entries.reduce((s, e) => s + e.amount, 0), drainCount: byDrain.size, entryCount: entries.length }, byDrain: Array.from(byDrain.entries()).map(([label, total]) => ({ label, total })), entries });
  }

  // ---- MISSING ----
  if (type === "missing") {
    if (!patientId) return NextResponse.json({ error: "patientId is required for missing report" }, { status: 400 });
    const period = await db.intakeOutputMonitoringPeriod.findFirst({ where: { patientId, status: "active" }, orderBy: { startedAt: "desc" } });
    if (!period) return NextResponse.json({ type: "missing", patientId, summary: { missingCount: 0, monitoringActive: false }, missingSlots: [] });
    const intervalMin = period.intervalMinutes || 60;
    const now = new Date();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const slotCount = Math.floor((24 * 60) / intervalMin);
    const recentEntries = await db.intakeOutputEntry.findMany({ where: { patientId, status: { not: "cancelled" }, eventAt: { gte: windowStart } }, select: { eventAt: true } });
    const missingSlots: any[] = [];
    for (let i = 0; i < slotCount; i++) {
      const slotStart = new Date(windowStart.getTime() + i * intervalMin * 60 * 1000);
      const slotEnd = new Date(slotStart.getTime() + intervalMin * 60 * 1000);
      if (slotStart > now) break;
      const hasEntry = recentEntries.some((e) => { const t = new Date(e.eventAt); return t >= slotStart && t < slotEnd; });
      if (!hasEntry) missingSlots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
    }
    return NextResponse.json({ type: "missing", patientId, summary: { missingCount: missingSlots.length, monitoringActive: true, intervalMinutes: intervalMin, windowHours: 24 }, missingSlots });
  }

  // ---- TREND ----
  if (type === "trend") {
    if (!patientId) return NextResponse.json({ error: "patientId is required for trend report" }, { status: 400 });
    const days = parseInt(url.searchParams.get("days") || "7");
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const end = new Date();
    const entries = await db.intakeOutputEntry.findMany({ where: { patientId, status: { not: "cancelled" }, eventAt: { gte: start, lte: end } }, orderBy: { eventAt: "asc" } });
    const byDay = new Map<string, { intake: number; output: number }>();
    for (const e of entries) {
      const k = dateKey(new Date(e.eventAt));
      const cur = byDay.get(k) || { intake: 0, output: 0 };
      if (e.entryType === "intake") cur.intake += e.amount;
      else cur.output += e.amount;
      byDay.set(k, cur);
    }
    const trend: any[] = [];
    let cumulative = 0;
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const k = dateKey(dt);
      const t = byDay.get(k) || { intake: 0, output: 0 };
      cumulative += t.intake - t.output;
      trend.push({ date: k, intake: t.intake, output: t.output, net: t.intake - t.output, cumulative });
    }
    return NextResponse.json({ type: "trend", patientId, days, trend });
  }

  // ---- AUDIT ----
  if (type === "audit") {
    const auditWhere: any = { resourceType: "intake_output_entry" };
    if (facilityId) auditWhere.facilityId = facilityId;
    const start = from ? new Date(`${from}T00:00:00`) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    auditWhere.createdAt = { gte: start, lte: end };
    const logs = await db.auditLog.findMany({ where: auditWhere, orderBy: { createdAt: "desc" }, take: 500, include: { user: { select: { firstName: true, lastName: true, username: true } } } });
    return NextResponse.json({ type: "audit", start, end, items: logs, count: logs.length });
  }

  return NextResponse.json({ error: `Unknown report type: ${type}` }, { status: 400 });
}
