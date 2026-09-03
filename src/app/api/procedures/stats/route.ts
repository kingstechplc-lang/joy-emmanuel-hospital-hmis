// =====================================================================
// API: /api/procedures/stats
//   GET — KPI statistics for the Procedures view.
//   KPIs:
//     totalProcedures, todayProcedures, requested, scheduled, inProgress,
//     completed, cancelled, documentationPending
// =====================================================================
import { NextResponse } from "next/server";
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

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCEDURE_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const rangeKey = (url.searchParams.get("range") || "today") as RangeKey;
  const customStart = url.searchParams.get("startDate") || undefined;
  const customEnd = url.searchParams.get("endDate") || undefined;

  if (facilityId) {
    const facility = await db.facility.findUnique({
      where: { id: facilityId },
      select: { organizationId: true },
    });
    if (!facility || facility.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Facility not found or not in your organization" }, { status: 404 });
    }
  }

  const { start, end } = resolveRange(rangeKey, customStart, customEnd);
  const scopeWhere: { facilityId?: string } = {};
  if (facilityId) scopeWhere.facilityId = facilityId;

  // Procedures use requestedAt for ordering; fall back to createdAt
  const dateScoped = {
    ...scopeWhere,
    requestedAt: { gte: start, lte: end },
    status: { not: "cancelled" },
  };
  const todayScoped = {
    ...scopeWhere,
    requestedAt: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) },
  };

  const [
    totalProcedures,
    todayProcedures,
    requested,
    scheduled,
    inProgress,
    completed,
    cancelled,
    documentationPending,
  ] = await Promise.all([
    db.procedure.count({ where: dateScoped }),
    db.procedure.count({ where: todayScoped }),
    db.procedure.count({ where: { ...scopeWhere, status: "requested" } }),
    db.procedure.count({ where: { ...scopeWhere, status: "scheduled" } }),
    db.procedure.count({ where: { ...scopeWhere, status: "in_progress" } }),
    db.procedure.count({ where: { ...scopeWhere, status: "completed" } }),
    db.procedure.count({ where: { ...scopeWhere, status: "cancelled" } }),
    db.procedure.count({
      where: {
        ...scopeWhere,
        status: "completed",
        OR: [{ findings: null }, { findings: "" }],
      },
    }),
  ]);

  return NextResponse.json({
    range: rangeKey,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    facilityId: facilityId || null,
    kpis: {
      totalProcedures: { value: totalProcedures, definition: "All non-cancelled procedures within the selected date range" },
      todayProcedures: { value: todayProcedures, definition: "Procedures requested today" },
      requested: { value: requested, definition: "Procedures with status = 'requested' (newly ordered, awaiting scheduling)" },
      scheduled: { value: scheduled, definition: "Procedures with status = 'scheduled'" },
      inProgress: { value: inProgress, definition: "Procedures with status = 'in_progress'" },
      completed: { value: completed, definition: "Procedures with status = 'completed'" },
      cancelled: { value: cancelled, definition: "Procedures with status = 'cancelled'" },
      documentationPending: { value: documentationPending, definition: "Completed procedures with no findings recorded" },
    },
  });
}
