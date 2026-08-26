// =====================================================================
// API: /api/intake-output
//   GET    — list entries for a patient with multiple aggregation modes
//   POST   — record a new intake/output entry (rich structured fields)
//   PATCH  — amend / verify / cancel an existing entry (audit-trail safe)
//
// Aggregation modes (GET ?view=...):
//   list         — chronological entries (default)
//   hourly       — hourly breakdown for a date
//   shift        — shift totals for a date (uses facility shift config)
//   daily        — daily totals (legacy default)
//   rolling24h   — rolling 24-hour totals ending at "now" or "to"
//   cumulative   — admission-scoped cumulative balance
//   summary      — patient summary: today, 24h, urine, drain, ng, missing
//
// Clinical safety:
//   - The system NEVER diagnoses or prescribes.
//   - Missing entries are surfaced as MISSING — never treated as 0 mL.
//   - Estimated values are clearly distinct from measured values.
//   - All corrections preserve the original value in `originalAmount` +
//     `amendmentReason` and write to the audit log.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// ---- Helpers ----------------------------------------------------------

const VALID_ENTRY_TYPES = ["intake", "output"];
const VALID_FLUID_TYPES = ["oral", "iv", "urine", "drainage", "blood_loss", "other"]; // legacy
const VALID_INTAKE_CATEGORIES = ["oral", "enteral", "iv", "medication", "blood_product", "other"];
const VALID_OUTPUT_CATEGORIES = ["urine", "drains", "gi", "other"];
const VALID_INTAKE_ROUTES = ["oral", "iv", "enteral", "ng", "peg", "blood_product", "other"];
const VALID_OUTPUT_ROUTES = ["voided", "catheter", "ng", "drain", "ostomy", "other"];
const VALID_COLLECTION_METHODS = ["measured_volume", "estimated", "counted", "other"];
const VALID_MEASUREMENT_TYPES = ["measured", "estimated"];
const VALID_CATHETER_STATUSES = ["none", "indwelling", "supra_pubic", "in_out", "external"];
const VALID_STATUSES = ["draft", "recorded", "verified", "amended", "cancelled"];

const SHIFT_DEFAULTS = {
  morning:   { start: "07:00", end: "15:00" },
  evening:   { start: "15:00", end: "23:00" },
  night:     { start: "23:00", end: "07:00" },
};

function parseShiftDefinition(json: string | null | undefined) {
  if (!json) return SHIFT_DEFAULTS;
  try {
    const parsed = JSON.parse(json);
    return { ...SHIFT_DEFAULTS, ...parsed };
  } catch {
    return SHIFT_DEFAULTS;
  }
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hourKey(d: Date) {
  return `${dateKey(d)} ${String(d.getHours()).padStart(2, "0")}:00`;
}

function inShift(eventTime: Date, shiftStart: string, shiftEnd: string, dayOffset = 0): boolean {
  // For simplicity, compare hh:mm strings against eventTime's hh:mm.
  // Night shift (23:00 → 07:00) spans midnight — handled below.
  const hh = String(eventTime.getHours()).padStart(2, "0");
  const mm = String(eventTime.getMinutes()).padStart(2, "0");
  const t = `${hh}:${mm}`;
  if (shiftStart <= shiftEnd) {
    return t >= shiftStart && t < shiftEnd;
  }
  // spans midnight
  return t >= shiftStart || t < shiftEnd;
}

// =====================================================================
// GET
// =====================================================================
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const admissionId = url.searchParams.get("admissionId");
  const view = url.searchParams.get("view") || "list"; // list | hourly | shift | daily | rolling24h | cumulative | summary
  const date = url.searchParams.get("date");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = parseInt(url.searchParams.get("limit") || "1000");

  if (!patientId) {
    return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  }

  // Validate patient belongs to user's org
  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: { id: true, organizationId: true, firstName: true, lastName: true, patientNumber: true, sex: true, dateOfBirth: true },
  });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  // ---- Build where clause ----
  const where: any = { patientId, status: { not: "cancelled" } };
  if (admissionId) where.admissionId = admissionId;

  if (view === "hourly" || view === "shift") {
    // Single-day breakdown
    const dayStr = date || dateKey(new Date());
    const start = new Date(`${dayStr}T00:00:00`);
    const end = new Date(`${dayStr}T23:59:59.999`);
    where.eventAt = { gte: start, lte: end };
  } else if (view === "rolling24h") {
    const end = to ? new Date(to) : new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    where.eventAt = { gte: start, lte: end };
  } else if (view === "daily") {
    if (date) {
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(`${date}T23:59:59.999`);
      where.eventAt = { gte: start, lte: end };
    } else if (from || to) {
      const range: any = {};
      if (from) range.gte = new Date(`${from}T00:00:00`);
      if (to) range.lte = new Date(`${to}T23:59:59.999`);
      where.eventAt = range;
    }
  } else if (view === "cumulative") {
    // Admission-scoped cumulative — get the admission's admittedAt as lower bound
    if (admissionId) {
      const adm = await db.admission.findUnique({ where: { id: admissionId }, select: { admittedAt: true, dischargedAt: true } });
      if (adm) {
        where.eventAt = { gte: adm.admittedAt };
        if (adm.dischargedAt) {
          (where.eventAt as any).lte = adm.dischargedAt;
        }
      }
    }
  }
  // view === "summary" → no date filter, but limit + last 7 days for trend

  const entries = await db.intakeOutputEntry.findMany({
    where,
    orderBy: { eventAt: "desc" },
    take: limit,
    include: {
      recordedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      verifiedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      amendedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });

  // ---- Compute aggregations ----
  let result: any = { items: entries, count: entries.length };

  if (view === "hourly") {
    const hourlyMap = new Map<string, { intake: number; output: number; entries: number }>();
    for (const e of entries) {
      const k = hourKey(new Date(e.eventAt));
      const cur = hourlyMap.get(k) || { intake: 0, output: 0, entries: 0 };
      if (e.entryType === "intake") cur.intake += e.amount;
      else if (e.entryType === "output") cur.output += e.amount;
      cur.entries += 1;
      hourlyMap.set(k, cur);
    }
    const dayStr = date || dateKey(new Date());
    const [y, m, d] = dayStr.split("-").map(Number);
    const hours: any[] = [];
    for (let h = 0; h < 24; h++) {
      const dt = new Date(y, m - 1, d, h, 0, 0);
      const k = hourKey(dt);
      const rec = hourlyMap.get(k);
      hours.push({
        hour: String(h).padStart(2, "0") + ":00",
        hourISO: dt.toISOString(),
        intake: rec?.intake || null,    // null = no entry (NOT 0)
        output: rec?.output || null,
        entries: rec?.entries || 0,
        net: rec ? rec.intake - rec.output : null,
      });
    }
    const totalIntake = hours.reduce((s, h) => s + (h.intake || 0), 0);
    const totalOutput = hours.reduce((s, h) => s + (h.output || 0), 0);
    result.hourly = hours;
    result.dailyTotals = [{ date: dayStr, intake: totalIntake, output: totalOutput, net: totalIntake - totalOutput }];
    result.summary = {
      totalIntake,
      totalOutput,
      netBalance: totalIntake - totalOutput,
      recordedHours: hours.filter((h) => h.entries > 0).length,
      missingHours: hours.filter((h) => h.entries === 0).length,
      coveragePct: Math.round((hours.filter((h) => h.entries > 0).length / 24) * 100),
    };
  } else if (view === "shift") {
    // Get facility monitoring period if exists, else defaults
    const period = await db.intakeOutputMonitoringPeriod.findFirst({
      where: { patientId, status: "active" },
      orderBy: { startedAt: "desc" },
    });
    const shifts = parseShiftDefinition(period?.shiftDefinition) as Record<string, { start: string; end: string }>;
    const dayStr = date || dateKey(new Date());
    const dayDate = new Date(`${dayStr}T00:00:00`);
    const shiftTotals: any[] = [];
    for (const [name, def] of Object.entries(shifts)) {
      const [sh, sm] = def.start.split(":").map(Number);
      const [eh, em] = def.end.split(":").map(Number);
      let startDt = new Date(dayDate);
      startDt.setHours(sh, sm, 0, 0);
      let endDt = new Date(dayDate);
      endDt.setHours(eh, em, 0, 0);
      if (endDt <= startDt) {
        // Spans midnight — end on next day
        endDt = new Date(endDt.getTime() + 24 * 60 * 60 * 1000);
      }
      const shiftEntries = entries.filter((e) => {
        const t = new Date(e.eventAt);
        return t >= startDt && t < endDt;
      });
      const intake = shiftEntries.filter((e) => e.entryType === "intake").reduce((s, e) => s + e.amount, 0);
      const output = shiftEntries.filter((e) => e.entryType === "output").reduce((s, e) => s + e.amount, 0);
      shiftTotals.push({
        shift: name,
        start: def.start,
        end: def.end,
        startISO: startDt.toISOString(),
        endISO: endDt.toISOString(),
        intake,
        output,
        net: intake - output,
        entryCount: shiftEntries.length,
        missing: shiftEntries.length === 0,
      });
    }
    result.shiftTotals = shiftTotals;
    result.summary = {
      totalIntake: shiftTotals.reduce((s, t) => s + t.intake, 0),
      totalOutput: shiftTotals.reduce((s, t) => s + t.output, 0),
      shiftsWithEntries: shiftTotals.filter((t) => t.entryCount > 0).length,
      missingShifts: shiftTotals.filter((t) => t.entryCount === 0).length,
    };
  } else if (view === "daily") {
    // Legacy daily totals (keep backward compat with existing view)
    const totalsByDate = new Map<string, { intake: number; output: number }>();
    for (const e of entries) {
      const k = dateKey(new Date(e.eventAt));
      const cur = totalsByDate.get(k) || { intake: 0, output: 0 };
      if (e.entryType === "intake") cur.intake += e.amount;
      else if (e.entryType === "output") cur.output += e.amount;
      totalsByDate.set(k, cur);
    }
    const dailyTotals = Array.from(totalsByDate.entries())
      .map(([dt, t]) => ({ date: dt, intake: t.intake, output: t.output, net: t.intake - t.output }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    result.dailyTotals = dailyTotals;
    result.summary = {
      totalIntake: dailyTotals.reduce((s, t) => s + t.intake, 0),
      totalOutput: dailyTotals.reduce((s, t) => s + t.output, 0),
    };
  } else if (view === "rolling24h") {
    const intake = entries.filter((e) => e.entryType === "intake").reduce((s, e) => s + e.amount, 0);
    const output = entries.filter((e) => e.entryType === "output").reduce((s, e) => s + e.amount, 0);
    // Breakdown by category
    const byCategory: Record<string, { intake: number; output: number }> = {};
    for (const e of entries) {
      const cat = e.category || e.fluidType || "other";
      if (!byCategory[cat]) byCategory[cat] = { intake: 0, output: 0 };
      if (e.entryType === "intake") byCategory[cat].intake += e.amount;
      else byCategory[cat].output += e.amount;
    }
    // Urine specific
    const urineEntries = entries.filter((e) =>
      e.entryType === "output" && (e.category === "urine" || e.fluidType === "urine")
    );
    const urineTotal = urineEntries.reduce((s, e) => s + e.amount, 0);
    const hours = 24;
    result.summary = {
      totalIntake: intake,
      totalOutput: output,
      netBalance: intake - output,
      urineOutput: urineTotal,
      urinePerHour: hours > 0 ? urineTotal / hours : 0,
      byCategory,
      windowHours: hours,
    };
    result.rolling24h = { intake, output, net: intake - output, byCategory };
  } else if (view === "cumulative") {
    // Cumulative by admission day
    const adm = admissionId
      ? await db.admission.findUnique({ where: { id: admissionId }, select: { admittedAt: true, dischargedAt: true } })
      : null;
    const startBoundary = adm?.admittedAt || new Date(0);
    const endBoundary = adm?.dischargedAt || new Date();
    const totalsByDate = new Map<string, { intake: number; output: number }>();
    for (const e of entries) {
      const t = new Date(e.eventAt);
      if (t < startBoundary || t > endBoundary) continue;
      const k = dateKey(t);
      const cur = totalsByDate.get(k) || { intake: 0, output: 0 };
      if (e.entryType === "intake") cur.intake += e.amount;
      else if (e.entryType === "output") cur.output += e.amount;
      totalsByDate.set(k, cur);
    }
    const dailyCumulative = Array.from(totalsByDate.entries())
      .map(([dt, t]) => ({ date: dt, intake: t.intake, output: t.output, net: t.intake - t.output }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    let running = 0;
    for (const d of dailyCumulative) {
      running += d.net;
      (d as any).cumulative = running;
    }
    const totalIntake = dailyCumulative.reduce((s, t) => s + t.intake, 0);
    const totalOutput = dailyCumulative.reduce((s, t) => s + t.output, 0);
    result.cumulative = dailyCumulative;
    result.summary = {
      totalIntake,
      totalOutput,
      netBalance: totalIntake - totalOutput,
      cumulative: running,
      dayCount: dailyCumulative.length,
    };
  } else if (view === "summary") {
    // Comprehensive summary: today, 24h rolling, urine breakdown, drain breakdown, ng breakdown, missing
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const rolling24Start = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Re-query for summary (bypass date filter)
    const summaryEntries = await db.intakeOutputEntry.findMany({
      where: { patientId, status: { not: "cancelled" }, eventAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
      orderBy: { eventAt: "desc" },
      take: 1000,
    });

    const inRange = (e: any, start: Date, end: Date) => {
      const t = new Date(e.eventAt);
      return t >= start && t <= end;
    };

    const todayEntries = summaryEntries.filter((e) => inRange(e, todayStart, todayEnd));
    const rolling24Entries = summaryEntries.filter((e) => inRange(e, rolling24Start, now));

    const calc = (list: any[]) => {
      const intake = list.filter((e) => e.entryType === "intake").reduce((s, e) => s + e.amount, 0);
      const output = list.filter((e) => e.entryType === "output").reduce((s, e) => s + e.amount, 0);
      const urine = list.filter((e) => e.entryType === "output" && (e.category === "urine" || e.fluidType === "urine")).reduce((s, e) => s + e.amount, 0);
      const drains = list.filter((e) => e.entryType === "output" && (e.category === "drains" || e.fluidType === "drainage")).reduce((s, e) => s + e.amount, 0);
      const ng = list.filter((e) => e.entryType === "output" && (e.route === "ng" || e.source?.toLowerCase().includes("ng"))).reduce((s, e) => s + e.amount, 0);
      const vomit = list.filter((e) => e.entryType === "output" && (e.source?.toLowerCase().includes("vomit") || e.source?.toLowerCase().includes("emesis"))).reduce((s, e) => s + e.amount, 0);
      return { intake, output, net: intake - output, urine, drains, ng, vomit };
    };

    const today = calc(todayEntries);
    const rolling = calc(rolling24Entries);

    // Latest weight (from vitals)
    const latestVitals = await db.vitalSign.findFirst({
      where: { patientId, weight: { not: null } },
      orderBy: { recordedAt: "desc" },
      select: { weight: true, recordedAt: true },
    });
    const weightKg = latestVitals?.weight || null;

    // Missing entries detection — based on monitoring period interval
    const period = await db.intakeOutputMonitoringPeriod.findFirst({
      where: { patientId, status: "active" },
      orderBy: { startedAt: "desc" },
    });
    let missingSlots: any[] = [];
    if (period) {
      const intervalMin = period.intervalMinutes || 60;
      const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const slotCount = Math.floor((24 * 60) / intervalMin);
      const slots: any[] = [];
      for (let i = 0; i < slotCount; i++) {
        const slotStart = new Date(windowStart.getTime() + i * intervalMin * 60 * 1000);
        const slotEnd = new Date(slotStart.getTime() + intervalMin * 60 * 1000);
        if (slotStart > now) break;
        const hasEntry = summaryEntries.some((e) => {
          const t = new Date(e.eventAt);
          return t >= slotStart && t < slotEnd;
        });
        if (!hasEntry) slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
      }
      missingSlots = slots.slice(-12); // most recent 12 missing slots
    }

    // Active monitoring period
    const monitoringPeriod = period
      ? {
          id: period.id,
          monitoringLevel: period.monitoringLevel,
          intervalMinutes: period.intervalMinutes,
          startedAt: period.startedAt,
          dailyTargetMl: period.dailyTargetMl,
          dailyLimitMl: period.dailyLimitMl,
          status: period.status,
        }
      : null;

    // Last entry
    const lastEntry = summaryEntries[0] || null;

    result.summary = {
      today,
      rolling24h: { ...rolling, urinePerHour: rolling.urine / 24, urinePerKgPerHour: weightKg ? rolling.urine / 24 / weightKg : null },
      weightKg,
      weightSource: latestVitals ? { recordedAt: latestVitals.recordedAt } : null,
      missingSlots,
      missingCount: missingSlots.length,
      monitoringPeriod,
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
    };
  } else {
    // list — also return daily totals + summary for backward compat
    const totalsByDate = new Map<string, { intake: number; output: number }>();
    for (const e of entries) {
      const k = dateKey(new Date(e.eventAt));
      const cur = totalsByDate.get(k) || { intake: 0, output: 0 };
      if (e.entryType === "intake") cur.intake += e.amount;
      else if (e.entryType === "output") cur.output += e.amount;
      totalsByDate.set(k, cur);
    }
    const dailyTotals = Array.from(totalsByDate.entries())
      .map(([dt, t]) => ({ date: dt, intake: t.intake, output: t.output, net: t.intake - t.output }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    result.dailyTotals = dailyTotals;
    result.summary = {
      totalIntake: dailyTotals.reduce((s, t) => s + t.intake, 0),
      totalOutput: dailyTotals.reduce((s, t) => s + t.output, 0),
    };
  }

  return NextResponse.json(result);
}

// =====================================================================
// POST — record new entry
// =====================================================================
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const {
    patientId, encounterId, admissionId, facilityId,
    entryType, fluidType, // legacy
    category, source, route, collectionMethod, drainLabel, catheterStatus, measurementType,
    unit, amount, weightKg,
    eventAt, // when fluid event occurred (may be in the past for late entries)
    notes, status,
    monitoringPeriodId,
  } = body;

  if (!patientId || !facilityId || !entryType || amount == null) {
    return NextResponse.json(
      { error: "patientId, facilityId, entryType, amount are required" },
      { status: 400 }
    );
  }
  // Require either fluidType (legacy) or category (new)
  if (!fluidType && !category) {
    return NextResponse.json({ error: "Either fluidType or category is required" }, { status: 400 });
  }

  if (!VALID_ENTRY_TYPES.includes(entryType)) {
    return NextResponse.json({ error: `entryType must be one of: ${VALID_ENTRY_TYPES.join(", ")}` }, { status: 400 });
  }
  if (fluidType && !VALID_FLUID_TYPES.includes(fluidType)) {
    return NextResponse.json({ error: `fluidType must be one of: ${VALID_FLUID_TYPES.join(", ")}` }, { status: 400 });
  }
  if (category) {
    const validCats = entryType === "intake" ? VALID_INTAKE_CATEGORIES : VALID_OUTPUT_CATEGORIES;
    if (!validCats.includes(category)) {
      return NextResponse.json({ error: `category for ${entryType} must be one of: ${validCats.join(", ")}` }, { status: 400 });
    }
  }
  if (route) {
    const validRoutes = entryType === "intake" ? VALID_INTAKE_ROUTES : VALID_OUTPUT_ROUTES;
    if (!validRoutes.includes(route)) {
      return NextResponse.json({ error: `route for ${entryType} must be one of: ${validRoutes.join(", ")}` }, { status: 400 });
    }
  }
  if (collectionMethod && !VALID_COLLECTION_METHODS.includes(collectionMethod)) {
    return NextResponse.json({ error: `collectionMethod must be one of: ${VALID_COLLECTION_METHODS.join(", ")}` }, { status: 400 });
  }
  if (measurementType && !VALID_MEASUREMENT_TYPES.includes(measurementType)) {
    return NextResponse.json({ error: `measurementType must be one of: ${VALID_MEASUREMENT_TYPES.join(", ")}` }, { status: 400 });
  }
  if (catheterStatus && !VALID_CATHETER_STATUSES.includes(catheterStatus)) {
    return NextResponse.json({ error: `catheterStatus must be one of: ${VALID_CATHETER_STATUSES.join(", ")}` }, { status: 400 });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const amt = Number(amount);
  if (Number.isNaN(amt) || amt < 0) {
    return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
  }
  if (amt > 100000) {
    return NextResponse.json({ error: "amount exceeds safe data-entry range (100 L). Verify unit." }, { status: 400 });
  }

  // Validate patient / facility / encounter / admission scope
  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  const facility = await db.facility.findUnique({ where: { id: facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  }
  if (encounterId) {
    const enc = await db.encounter.findUnique({ where: { id: encounterId } });
    if (!enc || enc.patientId !== patientId) {
      return NextResponse.json({ error: "Encounter does not belong to this patient" }, { status: 400 });
    }
  }
  if (admissionId) {
    const adm = await db.admission.findUnique({ where: { id: admissionId } });
    if (!adm || adm.patientId !== patientId) {
      return NextResponse.json({ error: "Admission does not belong to this patient" }, { status: 400 });
    }
  }
  if (monitoringPeriodId) {
    const mp = await db.intakeOutputMonitoringPeriod.findUnique({ where: { id: monitoringPeriodId } });
    if (!mp || mp.patientId !== patientId) {
      return NextResponse.json({ error: "Monitoring period does not belong to this patient" }, { status: 400 });
    }
  }

  // Snapshot weight if not provided — pull from latest vitals
  let weightSnapshot = weightKg ?? null;
  if (!weightSnapshot) {
    const v = await db.vitalSign.findFirst({
      where: { patientId, weight: { not: null } },
      orderBy: { recordedAt: "desc" },
      select: { weight: true },
    });
    weightSnapshot = v?.weight || null;
  }

  const eventTime = eventAt ? new Date(eventAt) : new Date();
  const documentedAt = new Date();

  const entry = await db.intakeOutputEntry.create({
    data: {
      patientId,
      encounterId: encounterId || null,
      admissionId: admissionId || null,
      facilityId,
      entryType,
      fluidType: fluidType || category || "other",
      category: category || null,
      source: source || null,
      route: route || null,
      collectionMethod: collectionMethod || null,
      drainLabel: drainLabel || null,
      catheterStatus: catheterStatus || null,
      measurementType: measurementType || "measured",
      unit: unit || "ml",
      amount: amt,
      weightKg: weightSnapshot,
      eventAt: eventTime,
      recordedAt: documentedAt,
      documentedAt,
      recordedById: session.user.id,
      status: status || "recorded",
      notes: notes || null,
      monitoringPeriodId: monitoringPeriodId || null,
    },
    include: {
      recordedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "INTAKE_OUTPUT_RECORDED",
    resourceType: "intake_output_entry",
    resourceId: entry.id,
    newValues: {
      patientId,
      entryType,
      category: category || fluidType,
      source,
      route,
      amount: amt,
      unit: unit || "ml",
      measurementType: measurementType || "measured",
      eventAt: eventTime,
      documentedAt,
      encounterId,
      admissionId,
      monitoringPeriodId,
      lateEntry: eventAt ? eventTime.getTime() !== documentedAt.getTime() : false,
      notesPreview: notes ? notes.slice(0, 200) : null,
    },
  });

  return NextResponse.json({ item: entry }, { status: 201 });
}

// =====================================================================
// PATCH — amend / verify / cancel an entry (audit-trail safe)
//   body: { entryId, action, amount?, reason?, notes? }
//   actions:
//     verify       — mark as verified
//     amend        — change amount, preserve originalAmount + reason
//     cancel       — mark as cancelled with reason
//     sign         — alias of verify
// =====================================================================
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { entryId, action, amount, reason, notes } = body;
  if (!entryId || !action) {
    return NextResponse.json({ error: "entryId and action are required" }, { status: 400 });
  }
  const validActions = ["verify", "amend", "cancel", "sign"];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${validActions.join(", ")}` }, { status: 400 });
  }

  const entry = await db.intakeOutputEntry.findUnique({ where: { id: entryId } });
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  // Validate patient scope
  const patient = await db.patient.findUnique({ where: { id: entry.patientId } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  if (entry.status === "cancelled") {
    return NextResponse.json({ error: "Cannot modify a cancelled entry" }, { status: 400 });
  }

  const now = new Date();
  const auditOldValues = {
    status: entry.status,
    amount: entry.amount,
    notes: entry.notes,
  };

  let updated: any;

  if (action === "verify" || action === "sign") {
    if (entry.status === "verified") {
      return NextResponse.json({ error: "Entry already verified" }, { status: 400 });
    }
    updated = await db.intakeOutputEntry.update({
      where: { id: entryId },
      data: {
        status: "verified",
        verifiedById: session.user.id,
        verifiedAt: now,
      },
    });
  } else if (action === "amend") {
    if (amount == null) {
      return NextResponse.json({ error: "amount is required for amend" }, { status: 400 });
    }
    const newAmt = Number(amount);
    if (Number.isNaN(newAmt) || newAmt < 0) {
      return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
    }
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: "reason is required for amend" }, { status: 400 });
    }
    updated = await db.intakeOutputEntry.update({
      where: { id: entryId },
      data: {
        amount: newAmt,
        originalAmount: entry.originalAmount ?? entry.amount, // preserve original
        status: "amended",
        amendedById: session.user.id,
        amendedAt: now,
        amendmentReason: reason,
        notes: notes ?? entry.notes,
      },
    });
  } else if (action === "cancel") {
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: "reason is required for cancel" }, { status: 400 });
    }
    updated = await db.intakeOutputEntry.update({
      where: { id: entryId },
      data: {
        status: "cancelled",
        cancelledAt: now,
        cancelReason: reason,
      },
    });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: entry.facilityId,
    action: `INTAKE_OUTPUT_${action.toUpperCase()}`,
    resourceType: "intake_output_entry",
    resourceId: entry.id,
    oldValues: auditOldValues,
    newValues: {
      status: updated.status,
      amount: updated.amount,
      reason: reason || null,
      amendedAt: updated.amendedAt,
      verifiedAt: updated.verifiedAt,
      cancelledAt: updated.cancelledAt,
    },
  });

  return NextResponse.json({ item: updated });
}
