// =====================================================================
// API: /api/lab-results/trend
//   GET — fetch historical numeric results for a patient+test for trend charting
//   Query: patientId, laboratoryTestId, componentId?, limit?
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.LAB_VIEW) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const laboratoryTestId = url.searchParams.get("laboratoryTestId");
  const componentId = url.searchParams.get("componentId");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  if (!patientId || !laboratoryTestId) {
    return NextResponse.json({ error: "patientId and laboratoryTestId are required" }, { status: 400 });
  }

  // Find all LabOrderItems for this patient+test, then their results (chronological)
  const items = await db.labOrderItem.findMany({
    where: {
      laboratoryTestId,
      labOrder: { patientId },
    },
    include: {
      labOrder: {
        select: { id: true, patientId: true, orderNumber: true, orderedAt: true, facilityId: true },
      },
      results: {
        where: {
          // Only include numeric results (skip text/qualitative)
          numericValue: { not: null },
          // Exclude cancelled
          status: { notIn: ["cancelled"] },
          // Filter by componentId if provided
          ...(componentId ? { componentId } : {}),
        },
        orderBy: { enteredAt: "asc" },
        select: {
          id: true,
          numericValue: true,
          unit: true,
          referenceRange: true,
          abnormalFlag: true,
          criticalFlag: true,
          isCritical: true,
          flagSource: true,
          flagRangeApplied: true,
          enteredAt: true,
          verifiedAt: true,
          releasedAt: true,
          status: true,
          componentId: true,
          componentName: true,
        },
      },
    },
    orderBy: { labOrder: { orderedAt: "asc" } },
    take: limit,
  });

  // Flatten results into a chronological trend
  const trend: any[] = [];
  for (const item of items) {
    for (const r of item.results) {
      trend.push({
        resultId: r.id,
        orderId: item.labOrder.id,
        orderNumber: item.labOrder.orderNumber,
        date: r.enteredAt || item.labOrder.orderedAt,
        orderedAt: item.labOrder.orderedAt,
        numericValue: r.numericValue,
        unit: r.unit,
        referenceRange: r.referenceRange,
        abnormalFlag: r.abnormalFlag,
        criticalFlag: r.criticalFlag,
        isCritical: r.isCritical,
        flagSource: r.flagSource,
        flagRangeApplied: r.flagRangeApplied,
        status: r.status,
        componentName: r.componentName,
      });
    }
  }

  // Sort by date ascending
  trend.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Fetch the test info for the chart label/unit
  const test = await db.laboratoryTest.findUnique({
    where: { id: laboratoryTestId },
    select: { id: true, name: true, code: true, unit: true, referenceRange: true },
  });

  return NextResponse.json({
    test,
    points: trend,
    count: trend.length,
    latest: trend[trend.length - 1] || null,
    earliest: trend[0] || null,
  });
}
