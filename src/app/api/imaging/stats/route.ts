// =====================================================================
// API: /api/imaging/stats
//   GET — KPI statistics for the Imaging view.
//   KPIs:
//     totalStudies, todayStudies, pending, performed, reportingPending,
//     verificationPending, completed, cancelled, avgTatMinutes
// =====================================================================
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

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
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function resolveRange(rangeKey: RangeKey, customStart?: string, customEnd?: string) {
  const now = new Date();
  let start: Date, end: Date;
  switch (rangeKey) {
    case "today":
      start = startOfDay(now);
      end = endOfDay(now);
      break;
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      start = startOfDay(y);
      end = endOfDay(y);
      break;
    }
    case "this_week":
      start = startOfWeek(now);
      end = endOfDay(now);
      break;
    case "this_month":
      start = startOfMonth(now);
      end = endOfDay(now);
      break;
    case "custom":
    default:
      if (customStart && customEnd) {
        start = startOfDay(new Date(customStart));
        end = endOfDay(new Date(customEnd));
      } else {
        start = startOfDay(now);
        end = endOfDay(now);
      }
      break;
  }
  return { start, end };
}

async function computeKpis(scopeWhere: { facilityId?: string }, dateRange: { start: Date; end: Date }) {
  const facilityFilter = scopeWhere.facilityId
    ? Prisma.sql`AND "facilityId" = ${scopeWhere.facilityId}`
    : Prisma.empty;

  const dateScoped = {
    ...scopeWhere,
    orderedAt: { gte: dateRange.start, lte: dateRange.end },
    status: { not: "cancelled" },
  };
  const todayScoped = {
    ...scopeWhere,
    orderedAt: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) },
  };

  const [
    totalStudies,
    todayStudies,
    pending,
    performed,
    reportingPending,
    verificationPending,
    completed,
    cancelled,
  ] = await Promise.all([
    db.imagingOrder.count({ where: dateScoped }),
    db.imagingOrder.count({ where: todayScoped }),
    db.imagingOrder.count({ where: { ...scopeWhere, status: "ordered" } }),
    db.imagingOrder.count({
      where: { ...scopeWhere, status: { in: ["performed", "reported"] } },
    }),
    db.imagingOrder.count({ where: { ...scopeWhere, status: "performed" } }),
    db.imagingOrder.count({ where: { ...scopeWhere, status: "reported" } }),
    db.imagingOrder.count({
      where: { ...scopeWhere, status: { in: ["verified", "released"] } },
    }),
    db.imagingOrder.count({ where: { ...scopeWhere, status: "cancelled" } }),
  ]);

  const tatResult = await db.$queryRaw<{ avg_minutes: number | null; n: bigint }[]>`
    SELECT
      AVG(EXTRACT(EPOCH FROM ("performedAt" - "orderedAt")) / 60.0) AS avg_minutes,
      COUNT(*) AS n
    FROM "ImagingOrder"
    WHERE "performedAt" IS NOT NULL
      AND "orderedAt" IS NOT NULL
      AND "performedAt" > "orderedAt"
      AND "status" <> 'cancelled'
      ${facilityFilter}
      AND "orderedAt" >= ${dateRange.start}
      AND "orderedAt" <= ${dateRange.end}
  `;
  const avgTatMinutes =
    tatResult[0]?.avg_minutes !== null && tatResult[0]?.avg_minutes !== undefined
      ? Number(tatResult[0].avg_minutes)
      : null;
  const avgTatSampleSize = Number(tatResult[0]?.n ?? 0);

  return {
    totalStudies,
    todayStudies,
    pending,
    performed,
    reportingPending,
    verificationPending,
    completed,
    cancelled,
    avgTatMinutes,
    avgTatSampleSize,
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.IMAGING_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const rangeKey = (url.searchParams.get("range") || "today") as RangeKey;
  const customStart = url.searchParams.get("startDate") || undefined;
  const customEnd = url.searchParams.get("endDate") || undefined;
  const compare = url.searchParams.get("compare") === "true";

  if (facilityId) {
    const facility = await db.facility.findUnique({
      where: { id: facilityId },
      select: { organizationId: true },
    });
    if (!facility || facility.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Facility not found or not in your organization" }, { status: 404 });
    }
  }

  const scopeWhere: { facilityId?: string } = {};
  if (facilityId) scopeWhere.facilityId = facilityId;

  const { start, end } = resolveRange(rangeKey, customStart, customEnd);
  const current = await computeKpis(scopeWhere, { start, end });

  const response: any = {
    range: rangeKey,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    facilityId: facilityId || null,
    kpis: {
      totalStudies: { value: current.totalStudies, definition: "All non-cancelled imaging orders within the selected date range" },
      todayStudies: { value: current.todayStudies, definition: "Imaging orders created today" },
      pending: { value: current.pending, definition: "Imaging orders with status = 'ordered'" },
      performed: { value: current.performed, definition: "Imaging orders with status IN [performed, reported]" },
      reportingPending: { value: current.reportingPending, definition: "Imaging orders with status = 'performed' (awaiting report)" },
      verificationPending: { value: current.verificationPending, definition: "Imaging orders with status = 'reported' (awaiting verification)" },
      completed: { value: current.completed, definition: "Imaging orders with status IN [verified, released]" },
      cancelled: { value: current.cancelled, definition: "Imaging orders with status = 'cancelled'" },
      avgTatMinutes: {
        value: current.avgTatMinutes !== null ? Math.round(current.avgTatMinutes * 10) / 10 : null,
        sampleSize: current.avgTatSampleSize,
        definition: "Average (performedAt - orderedAt) in minutes, only for orders with both timestamps",
      },
    },
  };

  if (compare) {
    // Compute previous range (1 day before for today, 1 week before for week, etc.)
    let prevStart: Date, prevEnd: Date;
    if (rangeKey === "today") {
      const y = new Date(start);
      y.setDate(y.getDate() - 1);
      prevStart = startOfDay(y);
      prevEnd = endOfDay(y);
    } else if (rangeKey === "yesterday") {
      const y = new Date(start);
      y.setDate(y.getDate() - 1);
      prevStart = startOfDay(y);
      prevEnd = endOfDay(y);
    } else {
      const spanMs = end.getTime() - start.getTime();
      prevEnd = new Date(start.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - spanMs);
    }
    const previous = await computeKpis(scopeWhere, { start: prevStart, end: prevEnd });
    response.previousRange = { startDate: prevStart.toISOString(), endDate: prevEnd.toISOString() };
    response.kpis.totalStudies.deltaPct = pctChange(current.totalStudies, previous.totalStudies);
    response.kpis.todayStudies.deltaPct = pctChange(current.todayStudies, previous.todayStudies);
    response.kpis.completed.deltaPct = pctChange(current.completed, previous.completed);
  }

  return NextResponse.json(response);
}
