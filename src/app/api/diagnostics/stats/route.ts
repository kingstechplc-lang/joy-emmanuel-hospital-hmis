// =====================================================================
// API: /api/diagnostics/stats
//   GET — Aggregated KPI statistics across the Diagnostics subsystem
//         (Lab Orders + Lab Results + Imaging + Procedures).
//
// All counts are computed server-side via Prisma count/aggregate.
// All queries respect:
//   - organization isolation (via facility.organizationId check)
//   - facility isolation (session.user.facilityId or ?facilityId=)
//   - user permissions (any of LAB_VIEW / IMAGING_VIEW / PROCEDURE_VIEW)
//   - date scope (today / yesterday / this_week / this_month / custom)
//
// KPI Definitions:
//   LAB
//     totalOrders           — Lab orders in scope (excluding cancelled)
//     todayOrders           — Lab orders created today
//     pendingCollection     — Lab orders with status = 'ordered' (samples not yet collected)
//     processing            — Lab orders with status IN [collected, received, processing]
//     pendingResults        — Lab orders with status = 'processing' (awaiting result entry)
//     verificationPending   — Lab orders with status = 'resulted' (awaiting verification)
//     criticalResults       — LabResult records with criticalFlag = true AND not yet released
//     completed             — Lab orders with status IN [verified, released]
//     cancelled             — Lab orders with status = 'cancelled'
//   IMAGING
//     totalStudies          — Imaging orders in scope (excluding cancelled)
//     pending               — Imaging orders with status = 'ordered' (pending scheduling/perform)
//     performed             — Imaging orders with status IN [performed, reported]
//     reportingPending      — Imaging orders with status = 'performed' (awaiting report)
//     verificationPending  — Imaging orders with status = 'reported' (awaiting verification)
//     completed            — Imaging orders with status IN [verified, released]
//   PROCEDURES
//     totalProcedures      — Procedures in scope (excluding cancelled)
//     scheduled            — Procedures with status = 'scheduled'
//     inProgress           — Procedures with status = 'in_progress'
//     completed            — Procedures with status = 'completed'
//     cancelled            — Procedures with status = 'cancelled'
//     documentationPending — Completed procedures without a procedure note (where findings IS NULL)
//
// Average turnaround time (TAT):
//   - Lab TAT: average of (verifiedAt - orderedAt) in minutes, only for orders that have BOTH timestamps
//   - Imaging TAT: average of (performedAt - orderedAt) in minutes (request → perform)
//   All computed via database-side SQL AVG using $queryRaw (O(1) memory, exact).
//
// Comparison: when ?compare=true, returns `previous` KPIs for the comparable
// prior period plus `deltaPct` for each metric (null when previous is 0).
// =====================================================================
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession, hasPermission, hasAnyPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// ---------------------------------------------------------------------
// Date range helpers (mirrors /api/encounters/stats)
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
async function computeKpis(scopeWhere: { facilityId?: string }, dateRange: { start: Date; end: Date }) {
  const facilityFilter = scopeWhere.facilityId
    ? Prisma.sql`AND "facilityId" = ${scopeWhere.facilityId}`
    : Prisma.empty;

  // Lab KPIs
  const labOrderedScoped = {
    ...scopeWhere,
    orderedAt: { gte: dateRange.start, lte: dateRange.end },
    status: { not: "cancelled" },
  };
  const labTodayScoped = {
    ...scopeWhere,
    orderedAt: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) },
  };

  const [
    labTotalOrders,
    labTodayOrders,
    labPendingCollection,
    labProcessing,
    labPendingResults,
    labVerificationPending,
    labCriticalResults,
    labCompleted,
    labCancelled,
  ] = await Promise.all([
    db.labOrder.count({ where: labOrderedScoped }),
    db.labOrder.count({ where: labTodayScoped }),
    db.labOrder.count({ where: { ...scopeWhere, status: "ordered" } }),
    db.labOrder.count({
      where: { ...scopeWhere, status: { in: ["collected", "received", "processing"] } },
    }),
    db.labOrder.count({ where: { ...scopeWhere, status: "processing" } }),
    db.labOrder.count({ where: { ...scopeWhere, status: "resulted" } }),
    // Critical results: criticalFlag=true AND not released
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

  // Lab TAT — DB-side aggregate
  const labTatResult = await db.$queryRaw<{ avg_minutes: number | null; n: bigint }[]>`
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
  const labTatMinutes =
    labTatResult[0]?.avg_minutes !== null && labTatResult[0]?.avg_minutes !== undefined
      ? Number(labTatResult[0].avg_minutes)
      : null;
  const labTatSampleSize = Number(labTatResult[0]?.n ?? 0);

  // Imaging KPIs
  const imagingScoped = {
    ...scopeWhere,
    orderedAt: { gte: dateRange.start, lte: dateRange.end },
    status: { not: "cancelled" },
  };
  const [
    imagingTotalStudies,
    imagingPending,
    imagingPerformed,
    imagingReportingPending,
    imagingVerificationPending,
    imagingCompleted,
  ] = await Promise.all([
    db.imagingOrder.count({ where: imagingScoped }),
    db.imagingOrder.count({ where: { ...scopeWhere, status: "ordered" } }),
    db.imagingOrder.count({
      where: { ...scopeWhere, status: { in: ["performed", "reported"] } },
    }),
    db.imagingOrder.count({ where: { ...scopeWhere, status: "performed" } }),
    db.imagingOrder.count({ where: { ...scopeWhere, status: "reported" } }),
    db.imagingOrder.count({
      where: { ...scopeWhere, status: { in: ["verified", "released"] } },
    }),
  ]);

  // Imaging TAT
  const imagingTatResult = await db.$queryRaw<{ avg_minutes: number | null; n: bigint }[]>`
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
  const imagingTatMinutes =
    imagingTatResult[0]?.avg_minutes !== null && imagingTatResult[0]?.avg_minutes !== undefined
      ? Number(imagingTatResult[0].avg_minutes)
      : null;
  const imagingTatSampleSize = Number(imagingTatResult[0]?.n ?? 0);

  // Procedures KPIs
  // Note: Procedure uses `requestedAt` for ordering; falls back to `createdAt`.
  const procScoped = {
    ...scopeWhere,
    requestedAt: { gte: dateRange.start, lte: dateRange.end },
    status: { not: "cancelled" },
  };
  const [
    procTotal,
    procScheduled,
    procInProgress,
    procCompleted,
    procCancelled,
    procDocumentationPending,
  ] = await Promise.all([
    db.procedure.count({ where: procScoped }),
    db.procedure.count({ where: { ...scopeWhere, status: "scheduled" } }),
    db.procedure.count({ where: { ...scopeWhere, status: "in_progress" } }),
    db.procedure.count({ where: { ...scopeWhere, status: "completed" } }),
    db.procedure.count({ where: { ...scopeWhere, status: "cancelled" } }),
    // Documentation pending = completed but no findings recorded
    db.procedure.count({
      where: {
        ...scopeWhere,
        status: "completed",
        OR: [{ findings: null }, { findings: "" }],
      },
    }),
  ]);

  return {
    lab: {
      totalOrders: labTotalOrders,
      todayOrders: labTodayOrders,
      pendingCollection: labPendingCollection,
      processing: labProcessing,
      pendingResults: labPendingResults,
      verificationPending: labVerificationPending,
      criticalResults: labCriticalResults,
      completed: labCompleted,
      cancelled: labCancelled,
      avgTatMinutes: labTatMinutes,
      avgTatSampleSize: labTatSampleSize,
    },
    imaging: {
      totalStudies: imagingTotalStudies,
      pending: imagingPending,
      performed: imagingPerformed,
      reportingPending: imagingReportingPending,
      verificationPending: imagingVerificationPending,
      completed: imagingCompleted,
      avgTatMinutes: imagingTatMinutes,
      avgTatSampleSize: imagingTatSampleSize,
    },
    procedures: {
      totalProcedures: procTotal,
      scheduled: procScheduled,
      inProgress: procInProgress,
      completed: procCompleted,
      cancelled: procCancelled,
      documentationPending: procDocumentationPending,
    },
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

// ---------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Allow access if user has any of the diagnostic view permissions
  if (
    !hasAnyPermission(session, [
      PERMISSIONS.LAB_VIEW,
      PERMISSIONS.IMAGING_VIEW,
      PERMISSIONS.PROCEDURE_VIEW,
    ])
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const rangeKey = (url.searchParams.get("range") || "today") as RangeKey;
  const customStart = url.searchParams.get("startDate") || undefined;
  const customEnd = url.searchParams.get("endDate") || undefined;
  const compare = url.searchParams.get("compare") === "true";

  // Facility org isolation
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

  // Compute current-period KPIs
  const current = await computeKpis(scopeWhere, { start, end });

  // Compute previous-period KPIs if comparison requested
  let previous: Awaited<ReturnType<typeof computeKpis>> | null = null;
  if (compare) {
    previous = await computeKpis(scopeWhere, { start: previousStart, end: previousEnd });
  }

  // Overall KPIs (combined)
  const overall = {
    totalDiagnostics:
      current.lab.totalOrders + current.imaging.totalStudies + current.procedures.totalProcedures,
    todayDiagnostics: current.lab.todayOrders,
    pendingDiagnostics:
      current.lab.pendingCollection +
      current.imaging.pending +
      current.procedures.scheduled,
    completedDiagnostics:
      current.lab.completed + current.imaging.completed + current.procedures.completed,
    urgentWorkload:
      current.lab.verificationPending +
      current.lab.criticalResults +
      current.imaging.verificationPending +
      current.procedures.documentationPending,
  };

  const response: any = {
    range: rangeKey,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    facilityId: facilityId || null,
    overall,
    lab: current.lab,
    imaging: current.imaging,
    procedures: current.procedures,
    kpiDefinitions: {
      "lab.totalOrders": "All non-cancelled lab orders within the selected date range",
      "lab.pendingCollection": "Lab orders with status = 'ordered' (samples not yet collected)",
      "lab.processing": "Lab orders with status IN [collected, received, processing]",
      "lab.pendingResults": "Lab orders with status = 'processing' (awaiting result entry)",
      "lab.verificationPending": "Lab orders with status = 'resulted' (awaiting verification)",
      "lab.criticalResults": "LabResult records with criticalFlag=true AND not yet released",
      "lab.completed": "Lab orders with status IN [verified, released]",
      "lab.avgTatMinutes": "Average (verifiedAt - orderedAt) in minutes, only for orders with both timestamps",
      "imaging.totalStudies": "All non-cancelled imaging orders within the selected date range",
      "imaging.pending": "Imaging orders with status = 'ordered'",
      "imaging.reportingPending": "Imaging orders with status = 'performed' (awaiting report)",
      "imaging.verificationPending": "Imaging orders with status = 'reported' (awaiting verification)",
      "imaging.completed": "Imaging orders with status IN [verified, released]",
      "imaging.avgTatMinutes": "Average (performedAt - orderedAt) in minutes",
      "procedures.totalProcedures": "All non-cancelled procedures within the selected date range",
      "procedures.scheduled": "Procedures with status = 'scheduled'",
      "procedures.inProgress": "Procedures with status = 'in_progress'",
      "procedures.completed": "Procedures with status = 'completed'",
      "procedures.documentationPending": "Completed procedures with no findings recorded",
    },
  };

  if (compare && previous) {
    response.previousRange = { startDate: previousStart.toISOString(), endDate: previousEnd.toISOString() };
    response.labDelta = {
      totalOrders: pctChange(current.lab.totalOrders, previous.lab.totalOrders),
      todayOrders: pctChange(current.lab.todayOrders, previous.lab.todayOrders),
      criticalResults: pctChange(current.lab.criticalResults, previous.lab.criticalResults),
      completed: pctChange(current.lab.completed, previous.lab.completed),
    };
    response.imagingDelta = {
      totalStudies: pctChange(current.imaging.totalStudies, previous.imaging.totalStudies),
      completed: pctChange(current.imaging.completed, previous.imaging.completed),
    };
    response.proceduresDelta = {
      totalProcedures: pctChange(current.procedures.totalProcedures, previous.procedures.totalProcedures),
      completed: pctChange(current.procedures.completed, previous.procedures.completed),
    };
    response.overallDelta = {
      totalDiagnostics: pctChange(overall.totalDiagnostics,
        previous.lab.totalOrders + previous.imaging.totalStudies + previous.procedures.totalProcedures),
    };
  }

  return NextResponse.json(response);
}
