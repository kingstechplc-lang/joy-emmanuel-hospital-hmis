// =====================================================================
// API: /api/transfers/reports
//   GET — transfer reports (daily / internal / external / delayed / by_reason / by_priority / performance / audit)
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

  const where: any = {};
  if (facilityId) {
    where.OR = [{ fromFacilityId: facilityId }, { toFacilityId: facilityId }];
  }

  if (type === "daily") {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59.999`);
    where.requestedAt = { gte: start, lte: end };
    const items = await db.patientTransfer.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      include: {
        patient: { select: { patientNumber: true, firstName: true, lastName: true, sex: true } },
        admission: { select: { admissionNumber: true, bedAssignments: { where: { status: "active" }, include: { ward: { select: { name: true } }, bed: { select: { bedNumber: true } } }, take: 1 } } },
        fromFacility: { select: { name: true } },
        toFacility: { select: { name: true } },
        requestedBy: { select: { firstName: true, lastName: true } },
      },
    });
    return NextResponse.json({ type, date, items, count: items.length });
  }

  if (type === "internal") {
    where.transferType = "internal";
    if (from || to) {
      const range: any = {};
      if (from) range.gte = new Date(`${from}T00:00:00`);
      if (to) range.lte = new Date(`${to}T23:59:59.999`);
      where.requestedAt = range;
    }
    const items = await db.patientTransfer.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      include: {
        patient: { select: { patientNumber: true, firstName: true, lastName: true } },
        fromFacility: { select: { name: true } },
        toFacility: { select: { name: true } },
      },
    });
    return NextResponse.json({ type, items, count: items.length });
  }

  if (type === "external") {
    where.transferType = "external";
    if (from || to) {
      const range: any = {};
      if (from) range.gte = new Date(`${from}T00:00:00`);
      if (to) range.lte = new Date(`${to}T23:59:59.999`);
      where.requestedAt = range;
    }
    const items = await db.patientTransfer.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      include: {
        patient: { select: { patientNumber: true, firstName: true, lastName: true } },
        fromFacility: { select: { name: true } },
        toFacility: { select: { name: true } },
      },
    });
    return NextResponse.json({ type, items, count: items.length });
  }

  if (type === "delayed") {
    where.status = "delayed";
    const items = await db.patientTransfer.findMany({
      where,
      orderBy: { delayedAt: "desc" },
      include: {
        patient: { select: { firstName: true, lastName: true, patientNumber: true } },
        fromFacility: { select: { name: true } },
        toFacility: { select: { name: true } },
      },
    });
    return NextResponse.json({ type, items, count: items.length });
  }

  if (type === "by_priority") {
    const start = from ? new Date(`${from}T00:00:00`) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    where.requestedAt = { gte: start, lte: end };
    const byPriorityRaw = await db.patientTransfer.groupBy({ by: ["priority"], where, _count: true });
    const byStatusRaw = await db.patientTransfer.groupBy({ by: ["status"], where, _count: true });
    return NextResponse.json({
      type, from: start, to: end,
      items: byPriorityRaw.map((r) => ({ priority: r.priority, count: r._count })),
      byStatus: byStatusRaw.map((r) => ({ status: r.status, count: r._count })),
    });
  }

  if (type === "performance") {
    const start = from ? new Date(`${from}T00:00:00`) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    where.status = "completed";
    where.completedAt = { gte: start, lte: end };
    const items = await db.patientTransfer.findMany({
      where,
      select: {
        transferNumber: true, requestedAt: true, approvedAt: true, departedAt: true, arrivedAt: true, completedAt: true,
        patient: { select: { firstName: true, lastName: true, patientNumber: true } },
        fromFacility: { select: { name: true } },
        toFacility: { select: { name: true } },
      },
      take: 500,
    });
    const perfData = items.map((t) => {
      const total = t.completedAt ? (new Date(t.completedAt).getTime() - new Date(t.requestedAt).getTime()) / (1000 * 60 * 60) : null;
      const requestToApprove = t.approvedAt ? (new Date(t.approvedAt).getTime() - new Date(t.requestedAt).getTime()) / (1000 * 60 * 60) : null;
      const departToArrive = t.arrivedAt && t.departedAt ? (new Date(t.arrivedAt).getTime() - new Date(t.departedAt).getTime()) / (1000 * 60 * 60) : null;
      return { ...t, totalHours: total ? Math.round(total * 10) / 10 : null, requestToApproveHours: requestToApprove ? Math.round(requestToApprove * 10) / 10 : null, departToArriveHours: departToArrive ? Math.round(departToArrive * 10) / 10 : null };
    });
    const avgTotal = perfData.length > 0 ? perfData.reduce((s, d) => s + (d.totalHours || 0), 0) / perfData.filter((d) => d.totalHours).length : 0;
    return NextResponse.json({ type, from: start, to: end, items: perfData, count: perfData.length, avgTotalHours: Math.round(avgTotal * 10) / 10 });
  }

  if (type === "audit") {
    const start = from ? new Date(`${from}T00:00:00`) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    const logs = await db.auditLog.findMany({
      where: { resourceType: "patient_transfer", createdAt: { gte: start, lte: end }, ...(facilityId ? { facilityId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { user: { select: { firstName: true, lastName: true, username: true } } },
    });
    return NextResponse.json({ type, from: start, to: end, items: logs, count: logs.length });
  }

  return NextResponse.json({ error: `Unknown report type: ${type}` }, { status: 400 });
}
