// =====================================================================
// API: /api/lab-orders/stats
//   GET — KPI statistics for the Lab Orders view.
//   KPIs:
//     totalOrders, todayOrders, pendingCollection, processing,
//     pendingResults, verificationPending, criticalResults, completed,
//     cancelled, avgTatMinutes
//   All queries respect organization + facility isolation.
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

function resolveRange(
  rangeKey: RangeKey,
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date; previousStart: Date; previousEnd: Date } {
  const now = new Date();
  let start: Date, end: Date, previousStart: Date, previousEnd: Date;
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
    totalOrders,
    todayOrders,
    pendingCollection,
    processing,
    pendingResults,
    verificationPending,
    criticalResults,
    completed,
    cancelled,
  ] = await Promise.all([
    db.labOrder.count({ where: dateScoped }),
    db.labOrder.count({ where: todayScoped }),
    db.labOrder.count({ where: { ...scopeWhere, status: "ordered" } }),
    db.labOrder.count({
      where: { ...scopeWhere, status: { in: ["collected", "received", "processing"] } },
    }),
    db.labOrder.count({ where: { ...scopeWhere, status: "processing" } }),
    db.labOrder.count({ where: { ...scopeWhere, status: "resulted" } }),
    db.labResult.count({
      where: {
        criticalFlag: true,
        releasedAt: null,
        labOrderItem: { labOrder: { ...scopeWhere } },
      },
    }),
    db.labOrder.count({ where: { ...scopeWhere, status: { in: ["verified", "released"] } } }),
    db.labOrder.count({ where: { ...scopeWhere, status: "cancelled" } }),
  ]);

  const tatResult = await db.$queryRaw<{ avg_minutes: number | null; n: bigint }[]>`
    SELECT
      AVG(EXTRACT(EPOCH FROM ("verifiedAt" - "orderedAt")) / 60.0) AS avg_minutes,
      COUNT(*) AS n
    FROM "LabOrder"
    WHERE "verifiedAt" IS NOT NULL
      AND "orderedAt" IS NOT NULL
      AND "verifiedAt" > "orderedAt"
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
    totalOrders,
    todayOrders,
    pendingCollection,
    processing,
    pendingResults,
    verificationPending,
    criticalResults,
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
  if (!hasPermission(session, PERMISSIONS.LAB_VIEW)) {
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

  const { start, end, previousStart, previousEnd } = resolveRange(rangeKey, customStart, customEnd);
  const current = await computeKpis(scopeWhere, { start, end });

  let previous: Awaited<ReturnType<typeof computeKpis>> | null = null;
  if (compare) {
    previous = await computeKpis(scopeWhere, { start: previousStart, end: previousEnd });
  }

  const response: any = {
    range: rangeKey,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    facilityId: facilityId || null,
    kpis: {
      totalOrders: { value: current.totalOrders, definition: "All non-cancelled lab orders within the selected date range" },
      todayOrders: { value: current.todayOrders, definition: "Lab orders created today" },
      pendingCollection: { value: current.pendingCollection, definition: "Lab orders with status = 'ordered' (samples not yet collected)" },
      processing: { value: current.processing, definition: "Lab orders with status IN [collected, received, processing]" },
      pendingResults: { value: current.pendingResults, definition: "Lab orders with status = 'processing' (awaiting result entry)" },
      verificationPending: { value: current.verificationPending, definition: "Lab orders with status = 'resulted' (awaiting verification)" },
      criticalResults: { value: current.criticalResults, definition: "LabResult records with criticalFlag=true AND not yet released" },
      completed: { value: current.completed, definition: "Lab orders with status IN [verified, released]" },
      cancelled: { value: current.cancelled, definition: "Lab orders with status = 'cancelled'" },
      avgTatMinutes: {
        value: current.avgTatMinutes !== null ? Math.round(current.avgTatMinutes * 10) / 10 : null,
        sampleSize: current.avgTatSampleSize,
        definition: "Average (verifiedAt - orderedAt) in minutes, only for orders with both timestamps",
      },
    },
  };

  if (compare && previous) {
    response.previousRange = { startDate: previousStart.toISOString(), endDate: previousEnd.toISOString() };
    response.kpis.totalOrders.deltaPct = pctChange(current.totalOrders, previous.totalOrders);
    response.kpis.todayOrders.deltaPct = pctChange(current.todayOrders, previous.todayOrders);
    response.kpis.criticalResults.deltaPct = pctChange(current.criticalResults, previous.criticalResults);
    response.kpis.completed.deltaPct = pctChange(current.completed, previous.completed);
  }

  return NextResponse.json(response);
}
