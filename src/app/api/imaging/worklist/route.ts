// =====================================================================
// API: /api/imaging/worklist
//   GET — radiology worklist grouped by status, with TAT calculation
//   Query: facilityId, status, modality, priority, date
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const SECTIONS = [
  { key: "pending", statuses: ["ordered"] },
  { key: "scheduled", statuses: ["scheduled"] },
  { key: "arrived", statuses: ["arrived"] },
  { key: "in_progress", statuses: ["in_progress"] },
  { key: "completed", statuses: ["completed"] },
  { key: "report_pending", statuses: ["reported"] },
  { key: "reported", statuses: ["verified"] },
  { key: "verified", statuses: ["verified"] },
  { key: "cancelled", statuses: ["cancelled", "no_show", "rescheduled"] },
];

function calcTat(order: any) {
  const now = new Date();
  const ordered = new Date(order.orderedAt);
  const endTime = order.releasedAt ? new Date(order.releasedAt) : now;
  const tatMinutes = Math.round((endTime.getTime() - ordered.getTime()) / 60000);
  return { tatMinutes };
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.IMAGING_VIEW) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const status = url.searchParams.get("status");
  const modality = url.searchParams.get("modality");
  const priority = url.searchParams.get("priority");
  const date = url.searchParams.get("date");
  const section = url.searchParams.get("section");

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  if (modality) where.modality = modality;
  if (priority) where.priority = priority;
  if (date) {
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);
    where.orderedAt = { gte: dayStart, lte: dayEnd };
  }

  const orders = await db.imagingOrder.findMany({
    where,
    orderBy: [
      { priority: "desc" },
      { orderedAt: "asc" },
    ],
    take: 200,
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } },
      facility: { select: { id: true, name: true, code: true } },
      orderingClinician: { select: { id: true, firstName: true, lastName: true } },
      reports: { where: { isLatest: true }, take: 1, select: { id: true, status: true, reportedAt: true, verifiedAt: true } },
    },
  });

  const enriched = orders.map((o) => {
    const tat = calcTat(o);
    return {
      ...o,
      report: o.reports?.[0] || null,
      tatMinutes: tat.tatMinutes,
    };
  });

  if (section) {
    const secDef = SECTIONS.find((s) => s.key === section);
    if (secDef) {
      return NextResponse.json({
        items: enriched.filter((o) => secDef.statuses.includes(o.status)),
        section,
      });
    }
  }

  const grouped: Record<string, any[]> = {};
  for (const sec of SECTIONS) {
    grouped[sec.key] = enriched.filter((o) => sec.statuses.includes(o.status));
  }

  return NextResponse.json({
    items: enriched,
    grouped,
    counts: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])),
    total: enriched.length,
  });
}
