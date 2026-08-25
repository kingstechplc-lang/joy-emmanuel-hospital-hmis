// =====================================================================
// API: /api/lab-orders/worklist
//   GET — laboratory worklist grouped by status, with TAT calculation
//   Query params: facilityId, status, priority, departmentId, date
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const SECTIONS = [
  { key: "pending_collection", statuses: ["ordered"] },
  { key: "collected", statuses: ["collected"] },
  { key: "processing", statuses: ["received", "processing"] },
  { key: "pending_result", statuses: ["processing"] },
  { key: "pending_validation", statuses: ["resulted"] },
  { key: "completed", statuses: ["verified", "released"] },
  { key: "rejected", statuses: ["rejected"] },
  { key: "cancelled", statuses: ["cancelled"] },
];

function calcTat(order: any): { tatMinutes: number | null; overdue: boolean; expectedTatMinutes: number | null } {
  const now = new Date();
  const ordered = new Date(order.orderedAt);
  let expectedTatMinutes: number | null = null;
  // Find the minimum configured TAT across all items' tests
  if (order.items && order.items.length > 0) {
    const tats = order.items
      .map((it: any) => it.laboratoryTest?.tatMinutes || it.laboratoryTest?.tatRoutineMin)
      .filter((t: any) => typeof t === "number" && t > 0);
    if (tats.length > 0) expectedTatMinutes = Math.min(...tats);
  }
  // Calculate elapsed minutes from ordered to now (or to releasedAt if released)
  const endTime = order.releasedAt ? new Date(order.releasedAt) : now;
  const tatMinutes = Math.round((endTime.getTime() - ordered.getTime()) / 60000);
  const overdue = expectedTatMinutes != null && tatMinutes > expectedTatMinutes && order.status !== "released" && order.status !== "cancelled";
  return { tatMinutes, overdue, expectedTatMinutes };
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.LAB_VIEW) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const departmentId = url.searchParams.get("departmentId");
  const date = url.searchParams.get("date");
  const section = url.searchParams.get("section");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (departmentId) where.departmentId = departmentId;
  if (date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    where.orderedAt = { gte: dayStart, lte: dayEnd };
  }

  const orders = await db.labOrder.findMany({
    where,
    orderBy: [
      { priority: "desc" }, // stat > urgent > routine (alphabetical-ish; consider proper ordering)
      { orderedAt: "asc" },
    ],
    take: 200,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } },
      facility: { select: { id: true, name: true, code: true } },
      orderingClinician: { select: { id: true, firstName: true, lastName: true } },
      items: { include: { laboratoryTest: { select: { id: true, name: true, code: true, category: true, tatMinutes: true, tatRoutineMin: true } }, results: { select: { id: true, abnormalFlag: true, criticalFlag: true, isCritical: true, status: true } } } },
      samples: { select: { id: true, sampleNumber: true, status: true, specimenType: true, collectedAt: true, rejectionReasonCode: true } },
    },
  });

  // Enrich with TAT
  const enriched = orders.map((o) => {
    const tat = calcTat(o);
    return {
      ...o,
      tatMinutes: tat.tatMinutes,
      expectedTatMinutes: tat.expectedTatMinutes,
      overdue: tat.overdue,
    };
  });

  // If a specific section is requested, filter to that section
  if (section) {
    const secDef = SECTIONS.find((s) => s.key === section);
    if (secDef) {
      return NextResponse.json({
        items: enriched.filter((o) => secDef.statuses.includes(o.status)),
        section,
      });
    }
  }

  // Group by section
  const grouped: Record<string, any[]> = {};
  for (const sec of SECTIONS) {
    grouped[sec.key] = enriched.filter((o) => sec.statuses.includes(o.status));
  }

  return NextResponse.json({
    items: enriched,
    grouped,
    counts: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])),
    total: enriched.length,
    overdueCount: enriched.filter((o) => o.overdue).length,
    criticalCount: enriched.filter((o) => o.items.some((it: any) => it.results.some((r: any) => r.isCritical || r.criticalFlag))).length,
  });
}
