// =====================================================================
// API: /api/encounters/stats
//   GET — Real KPI statistics for the Encounters dashboard.
//
// All counts are computed server-side via Prisma aggregate/count/groupBy.
// All queries respect:
//   - organization isolation (session.user.organizationId)
//   - facility isolation (session.user.facilityId or ?facilityId=)
//   - user permissions (requires ENCOUNTER_VIEW)
//   - date scope (today / yesterday / this_week / this_month / custom)
//
// KPI Definitions:
//   TOTAL          — All authorized Encounter records within the selected date range
//   TODAY          — Encounters with startAt within today (00:00 – 23:59 local)
//   ACTIVE         — status IN (open, in_progress, admitted)  [non-terminal]
//   CLOSED         — status IN (completed, discharged)         [terminal-completed]
//   CANCELLED       — status = cancelled
//   WALK_IN        — source = walkin
//   APPOINTMENT    — source = appointment
//   EMERGENCY      — encounterType = emergency
//   INSURED        — EncounterCoverage.payerType != self_pay (NHIS / private_insurance / corporate / employer / government / other)
//   SELF_PAY       — EncounterCoverage.payerType = self_pay  (or no coverage record at all)
//   AVG_DURATION   — Average (endAt - startAt) in minutes, ONLY for encounters that have BOTH timestamps
//
// Comparisons: when ?compare=true, the route also returns `previous` KPIs for
// the comparable prior period, plus a `delta` percentage for each metric
// where a meaningful comparison is possible.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// ---------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------
type RangeKey = "today" | "yesterday" | "this_week" | "this_month" | "custom";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d: Date): Date {
  // Week starts on Monday
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun, 1=Mon...
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Resolve a range key (plus optional custom start/end) into { start, end }.
 * Returns the previous-comparable range as well.
 */
function resolveRange(
  rangeKey: RangeKey,
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date; previousStart: Date; previousEnd: Date } {
  const now = new Date();
  let start: Date;
  let end: Date;
  let previousStart: Date;
  let previousEnd: Date;

  switch (rangeKey) {
    case "today": {
      start = startOfDay(now);
      end = endOfDay(now);
      const y = new Date(start);
      y.setDate(y.getDate() - 1);
      previousStart = startOfDay(y);
      previousEnd = endOfDay(y);
      break;
    }
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      start = startOfDay(y);
      end = endOfDay(y);
      const y2 = new Date(y);
      y2.setDate(y2.getDate() - 1);
      previousStart = startOfDay(y2);
      previousEnd = endOfDay(y2);
      break;
    }
    case "this_week": {
      start = startOfWeek(now);
      end = endOfDay(now);
      const spanMs = end.getTime() - start.getTime();
      previousEnd = new Date(start.getTime() - 1);
      previousStart = new Date(previousEnd.getTime() - spanMs);
      break;
    }
    case "this_month": {
      start = startOfMonth(now);
      end = endOfDay(now);
      const spanMs = end.getTime() - start.getTime();
      previousEnd = new Date(start.getTime() - 1);
      previousStart = new Date(previousEnd.getTime() - spanMs);
      break;
    }
    case "custom":
    default: {
      if (customStart && customEnd) {
        start = startOfDay(new Date(customStart));
        end = endOfDay(new Date(customEnd));
        const spanMs = end.getTime() - start.getTime();
        previousEnd = new Date(start.getTime() - 1);
        previousStart = new Date(previousEnd.getTime() - spanMs);
      } else {
        // Fallback — treat as "today"
        start = startOfDay(now);
        end = endOfDay(now);
        const y = new Date(start);
        y.setDate(y.getDate() - 1);
        previousStart = startOfDay(y);
        previousEnd = endOfDay(y);
      }
      break;
    }
  }
  return { start, end, previousStart, previousEnd };
}

// ---------------------------------------------------------------------
// KPI computation
// ---------------------------------------------------------------------
async function computeKpis(scopeWhere: any, dateRange: { start: Date; end: Date }) {
  // Scope within date range
  const dateScoped = {
    ...scopeWhere,
    startAt: { gte: dateRange.start, lte: dateRange.end },
  };

  // Run parallel counts — each is a single Prisma query
  const [
    total,
    todayCount,
    activeCount,
    closedCount,
    cancelledCount,
    walkInCount,
    appointmentCount,
    emergencyCount,
    insuredCount,
    selfPayCount,
  ] = await Promise.all([
    db.encounter.count({ where: dateScoped }),
    // Today (independent of the selected range — always shows today)
    db.encounter.count({
      where: {
        ...scopeWhere,
        startAt: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) },
      },
    }),
    db.encounter.count({
      where: { ...scopeWhere, status: { in: ["open", "in_progress", "admitted"] } },
    }),
    db.encounter.count({
      where: { ...scopeWhere, status: { in: ["completed", "discharged"] } },
    }),
    db.encounter.count({ where: { ...scopeWhere, status: "cancelled" } }),
    db.encounter.count({ where: { ...scopeWhere, source: "walkin" } }),
    db.encounter.count({ where: { ...scopeWhere, source: "appointment" } }),
    db.encounter.count({ where: { ...scopeWhere, encounterType: "emergency" } }),
    // Insured: any EncounterCoverage where payerType != self_pay
    db.encounterCoverage.count({
      where: {
        payerType: { not: "self_pay" },
        encounter: { ...scopeWhere },
      },
    }),
    // Self-pay: EncounterCoverage with payerType = self_pay
    db.encounterCoverage.count({
      where: {
        payerType: "self_pay",
        encounter: { ...scopeWhere },
      },
    }),
  ]);

  // Average duration in minutes — only for encounters with BOTH timestamps.
  // We compute in JS since Prisma's aggregate _avg only works on numeric columns
  // and we don't have a duration column.
  // Note: `startAt` is non-nullable in the schema (DateTime @default(now())),
  // so the date range filter in `dateScoped` already implies startAt is set.
  // For `endAt` (nullable), we use `NOT: [{ endAt: null }]` to avoid the
  // `not: null` syntax which Prisma 6.x rejects on nullable field types.
  const durationRecords = await db.encounter.findMany({
    where: {
      ...dateScoped,
      NOT: [{ endAt: null }],
    },
    select: { startAt: true, endAt: true },
    take: 5000, // safety cap — avoids unbounded scans on huge tables
  });

  let avgDurationMinutes: number | null = null;
  if (durationRecords.length > 0) {
    const totalMs = durationRecords.reduce((sum, r) => {
      const ms = new Date(r.endAt!).getTime() - new Date(r.startAt!).getTime();
      return sum + (ms > 0 ? ms : 0);
    }, 0);
    avgDurationMinutes = totalMs / durationRecords.length / 60000;
  }

  return {
    total,
    today: todayCount,
    active: activeCount,
    closed: closedCount,
    cancelled: cancelledCount,
    walkIn: walkInCount,
    appointment: appointmentCount,
    emergency: emergencyCount,
    insured: insuredCount,
    selfPay: selfPayCount,
    avgDurationMinutes,
    avgDurationSampleSize: durationRecords.length,
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null; // null = "not meaningful" when previous is 0
  }
  return ((current - previous) / previous) * 100;
}

// ---------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ENCOUNTER_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const rangeKey = (url.searchParams.get("range") || "today") as RangeKey;
  const customStart = url.searchParams.get("startDate") || undefined;
  const customEnd = url.searchParams.get("endDate") || undefined;
  const compare = url.searchParams.get("compare") === "true";

  // Build facility-scoped where (organization isolation is implicit because
  // the facility itself belongs to the organization; we still verify)
  const scopeWhere: any = {};
  if (facilityId) scopeWhere.facilityId = facilityId;

  // Verify the facility belongs to the user's organization (prevents cross-org KPI leakage)
  if (facilityId) {
    const facility = await db.facility.findUnique({
      where: { id: facilityId },
      select: { organizationId: true },
    });
    if (!facility || facility.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Facility not found or not in your organization" }, { status: 404 });
    }
  }

  const { start, end, previousStart, previousEnd } = resolveRange(rangeKey, customStart, customEnd);

  // Compute current-period KPIs
  const current = await computeKpis(scopeWhere, { start, end });

  // Compute previous-period KPIs if comparison requested
  let previous: Awaited<ReturnType<typeof computeKpis>> | null = null;
  if (compare) {
    previous = await computeKpis(scopeWhere, { start: previousStart, end: previousEnd });
  }

  // Build response with definitions and (optional) comparison deltas
  const response: any = {
    range: rangeKey,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    facilityId: facilityId || null,
    kpis: {
      total: { value: current.total, definition: "All authorized Encounter records within the selected date range" },
      today: { value: current.today, definition: "Encounters with startAt within today (00:00–23:59 local)" },
      active: {
        value: current.active,
        definition: "Encounters whose status is open, in_progress, or admitted (non-terminal)",
      },
      closed: {
        value: current.closed,
        definition: "Encounters whose status is completed or discharged (terminal-completed)",
      },
      cancelled: { value: current.cancelled, definition: "Encounters whose status is cancelled" },
      walkIn: { value: current.walkIn, definition: "Encounters whose source is 'walkin'" },
      appointment: { value: current.appointment, definition: "Encounters whose source is 'appointment'" },
      emergency: { value: current.emergency, definition: "Encounters whose encounterType is 'emergency'" },
      insured: {
        value: current.insured,
        definition:
          "Encounters with an EncounterCoverage record whose payerType is not 'self_pay' (NHIS / private insurance / corporate / employer / government / other)",
      },
      selfPay: {
        value: current.selfPay,
        definition:
          "Encounters with an EncounterCoverage record whose payerType is 'self_pay' (excludes encounters with no coverage record)",
      },
      avgDurationMinutes: {
        value: current.avgDurationMinutes !== null ? Math.round(current.avgDurationMinutes * 10) / 10 : null,
        sampleSize: current.avgDurationSampleSize,
        definition:
          "Average (endAt - startAt) in minutes, computed only over encounters that have BOTH timestamps",
      },
    },
  };

  if (compare && previous) {
    response.previousRange = {
      startDate: previousStart.toISOString(),
      endDate: previousEnd.toISOString(),
    };
    response.kpis.total.deltaPct = pctChange(current.total, previous.total);
    response.kpis.today.deltaPct = pctChange(current.today, previous.today);
    response.kpis.active.deltaPct = pctChange(current.active, previous.active);
    response.kpis.closed.deltaPct = pctChange(current.closed, previous.closed);
    response.kpis.cancelled.deltaPct = pctChange(current.cancelled, previous.cancelled);
    response.kpis.walkIn.deltaPct = pctChange(current.walkIn, previous.walkIn);
    response.kpis.appointment.deltaPct = pctChange(current.appointment, previous.appointment);
    response.kpis.emergency.deltaPct = pctChange(current.emergency, previous.emergency);
    response.kpis.insured.deltaPct = pctChange(current.insured, previous.insured);
    response.kpis.selfPay.deltaPct = pctChange(current.selfPay, previous.selfPay);
    response.kpis.avgDurationMinutes.deltaPct = pctChange(
      current.avgDurationMinutes ?? 0,
      previous.avgDurationMinutes ?? 0
    );
  }

  return NextResponse.json(response);
}
