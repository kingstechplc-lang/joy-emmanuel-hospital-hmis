// =====================================================================
// API: /api/discharges/reports
//   GET — discharge reports (daily / ward / monthly / by type / LOS / etc.)
//
// By default, reports include ALL discharge records (requested + finalized)
// so the user can see activity even before finalization. Pass ?finalizedOnly=true
// to restrict to finalized discharges only.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ADMISSION_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "daily";
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const finalizedOnly = url.searchParams.get("finalizedOnly") === "true";

  // Build where clause — facilityId scoping via OR (discharge.facilityId, admission.facilityId)
  const where: any = {};
  if (facilityId) {
    where.OR = [{ facilityId }, { admission: { facilityId } }];
  }
  if (finalizedOnly) {
    where.isFinalized = true;
  }

  // Helper: determine the "effective date" for a discharge record.
  // Finalized discharges use dischargedAt; pending discharges use requestedAt.
  // We filter by whichever is set, using OR so both show up.
  const dateFilter = (start: Date, end: Date) => ({
    OR: [
      { dischargedAt: { gte: start, lte: end } },
      { requestedAt: { gte: start, lte: end } },
    ],
  });

  if (type === "daily") {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59.999`);
    Object.assign(where, dateFilter(start, end));
    const items = await db.dischargeRecord.findMany({
      where,
      orderBy: { dischargedAt: "desc" },
      include: {
        patient: { select: { patientNumber: true, firstName: true, lastName: true, sex: true, dateOfBirth: true } },
        admission: { select: { admissionNumber: true, admittedAt: true, bedAssignments: { where: { status: "active" }, include: { ward: { select: { name: true } }, bed: { select: { bedNumber: true } } }, take: 1 } } },
        dischargedBy: { select: { firstName: true, lastName: true } },
        requestedBy: { select: { firstName: true, lastName: true } },
      },
    });
    return NextResponse.json({ type, date, items, count: items.length });
  }

  if (type === "monthly") {
    const monthStr = date.slice(0, 7); // YYYY-MM
    const [y, m] = monthStr.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    Object.assign(where, dateFilter(start, end));
    const items = await db.dischargeRecord.findMany({
      where,
      orderBy: { dischargedAt: "desc" },
      include: { patient: { select: { patientNumber: true, firstName: true, lastName: true } }, admission: { select: { admissionNumber: true, admittedAt: true } } },
    });
    const byType: Record<string, number> = {};
    const byDisposition: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const d of items) {
      byType[d.dischargeType || "routine"] = (byType[d.dischargeType || "routine"] || 0) + 1;
      byDisposition[d.disposition || "home"] = (byDisposition[d.disposition || "home"] || 0) + 1;
      byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    }
    return NextResponse.json({ type, month: monthStr, items, count: items.length, byType, byDisposition, byStatus });
  }

  if (type === "los") {
    const start = from ? new Date(`${from}T00:00:00`) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    Object.assign(where, dateFilter(start, end));
    where.isFinalized = true; // LOS only makes sense for finalized discharges
    where.admissionDate = { not: null };
    const items = await db.dischargeRecord.findMany({
      where,
      select: {
        dischargeNumber: true, admissionDate: true, dischargedAt: true, dischargeType: true, disposition: true,
        patient: { select: { firstName: true, lastName: true, patientNumber: true } },
        admission: { select: { admissionNumber: true, bedAssignments: { where: { status: "active" }, include: { ward: { select: { name: true } } }, take: 1 } } },
      },
      take: 500,
    });
    const losData = items
      .map((d) => {
        const los = (new Date(d.dischargedAt).getTime() - new Date(d.admissionDate!).getTime()) / (1000 * 60 * 60 * 24);
        return { ...d, los: Math.round(los * 10) / 10 };
      })
      .filter((d) => d.los >= 0);
    const avgLOS = losData.length > 0 ? losData.reduce((s, d) => s + d.los, 0) / losData.length : 0;
    return NextResponse.json({ type, from: start, to: end, items: losData, count: losData.length, avgLOS: Math.round(avgLOS * 10) / 10 });
  }

  if (type === "by_type") {
    const start = from ? new Date(`${from}T00:00:00`) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    Object.assign(where, dateFilter(start, end));
    const byTypeRaw = await db.dischargeRecord.groupBy({ by: ["dischargeType"], where, _count: true });
    const byStatusRaw = await db.dischargeRecord.groupBy({ by: ["status"], where, _count: true });
    return NextResponse.json({
      type, from: start, to: end,
      items: byTypeRaw.map((r) => ({ type: r.dischargeType || "routine", count: r._count })),
      byStatus: byStatusRaw.map((r) => ({ status: r.status, count: r._count })),
    });
  }

  if (type === "delayed") {
    where.status = "delayed";
    const items = await db.dischargeRecord.findMany({
      where,
      orderBy: { delayedAt: "desc" },
      include: {
        patient: { select: { firstName: true, lastName: true, patientNumber: true } },
        admission: { select: { admissionNumber: true, bedAssignments: { where: { status: "active" }, include: { ward: { select: { name: true } }, bed: { select: { bedNumber: true } } }, take: 1 } } },
      },
    });
    return NextResponse.json({ type, items, count: items.length });
  }

  if (type === "pending") {
    where.status = { in: ["requested", "approved", "pending_clearance", "ready", "delayed"] };
    const items = await db.dischargeRecord.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      include: {
        patient: { select: { firstName: true, lastName: true, patientNumber: true, sex: true, dateOfBirth: true } },
        admission: { select: { admissionNumber: true, admittedAt: true, bedAssignments: { where: { status: "active" }, include: { ward: { select: { name: true } }, bed: { select: { bedNumber: true } } }, take: 1 } } },
        requestedBy: { select: { firstName: true, lastName: true } },
      },
    });
    return NextResponse.json({ type, items, count: items.length });
  }

  if (type === "audit") {
    const start = from ? new Date(`${from}T00:00:00`) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    const logs = await db.auditLog.findMany({
      where: {
        resourceType: "discharge_record",
        createdAt: { gte: start, lte: end },
        ...(facilityId ? { facilityId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { user: { select: { firstName: true, lastName: true, username: true } } },
    });
    return NextResponse.json({ type, from: start, to: end, items: logs, count: logs.length });
  }

  return NextResponse.json({ error: `Unknown report type: ${type}` }, { status: 400 });
}
