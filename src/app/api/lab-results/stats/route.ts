// =====================================================================
// API: /api/lab-results/stats
//   GET — KPI statistics for the Lab Results view.
//   KPIs:
//     totalResults, todayResults, abnormalResults, criticalResults,
//     pendingVerification, released, amended, avgResultValueCount
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
  if (!hasPermission(session, PERMISSIONS.LAB_VIEW)) {
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

  // All counts scope through LabOrder relation
  const orderScope = facilityId ? { facilityId } : {};
  const dateScopedOrder = {
    ...orderScope,
    orderedAt: { gte: start, lte: end },
  };

  // Count results matching various criteria via the labOrderItem.labOrder relation
  const [
    totalResults,
    todayResults,
    abnormalResults,
    criticalResults,
    pendingVerification,
    released,
    amended,
  ] = await Promise.all([
    db.labResult.count({
      where: { labOrderItem: { labOrder: dateScopedOrder } },
    }),
    db.labResult.count({
      where: {
        labOrderItem: {
          labOrder: { ...orderScope, orderedAt: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) } },
        },
      },
    }),
    db.labResult.count({
      where: {
        abnormalFlag: { in: ["low", "high", "critical_low", "critical_high", "abnormal"] },
        labOrderItem: { labOrder: dateScopedOrder },
      },
    }),
    db.labResult.count({
      where: {
        criticalFlag: true,
        labOrderItem: { labOrder: dateScopedOrder },
      },
    }),
    db.labResult.count({
      where: {
        enteredAt: { not: null },
        verifiedAt: null,
        labOrderItem: { labOrder: orderScope },
      },
    }),
    db.labResult.count({
      where: {
        releasedAt: { not: null },
        labOrderItem: { labOrder: dateScopedOrder },
      },
    }),
    db.labResult.count({
      where: {
        amendedFromId: { not: null },
        labOrderItem: { labOrder: dateScopedOrder },
      },
    }),
  ]);

  return NextResponse.json({
    range: rangeKey,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    facilityId: facilityId || null,
    kpis: {
      totalResults: { value: totalResults, definition: "All lab results within the selected date range" },
      todayResults: { value: todayResults, definition: "Lab results entered today" },
      abnormalResults: { value: abnormalResults, definition: "Lab results with abnormalFlag IN [low, high, critical_low, critical_high, abnormal]" },
      criticalResults: { value: criticalResults, definition: "Lab results with criticalFlag = true" },
      pendingVerification: { value: pendingVerification, definition: "Lab results entered but not yet verified" },
      released: { value: released, definition: "Lab results that have been released to clinicians" },
      amended: { value: amended, definition: "Lab results that have been amended (corrected after release)" },
    },
  });
}
