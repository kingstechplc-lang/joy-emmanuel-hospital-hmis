// =====================================================================
// API: /api/beds/[id]/maintenance
//   GET  — list maintenance records for a bed
//   POST — report/start/resolve maintenance
//   Body: { action: "report" | "start" | "resolve", reason, expectedCompletion, technicianName, notes }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_VIEW) && !session.user.permissions?.includes(PERMISSIONS.BED_MANAGE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const records = await db.bedMaintenance.findMany({
    where: { bedId: id },
    orderBy: { reportedAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ items: records, count: records.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.BED_MANAGE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const bed = await db.bed.findUnique({ where: { id } });
  if (!bed) return NextResponse.json({ error: "Bed not found" }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { action, reason, expectedCompletion, technicianName, notes } = body;

  if (action === "report") {
    const record = await db.bedMaintenance.create({
      data: {
        bedId: id, facilityId: bed.facilityId,
        status: "reported",
        reason: reason || null,
        expectedCompletion: expectedCompletion ? new Date(expectedCompletion) : null,
        reportedById: session.user.id,
        notes: notes || null,
      },
    });
    await db.bed.update({ where: { id }, data: { status: "maintenance" } });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId: bed.facilityId,
      action: "BED_MAINTENANCE_REPORTED", resourceType: "bed", resourceId: id,
      newValues: { reason, expectedCompletion },
    });
    return NextResponse.json({ item: record }, { status: 201 });
  }

  if (action === "start") {
    const record = await db.bedMaintenance.findFirst({
      where: { bedId: id, status: "reported" },
      orderBy: { reportedAt: "desc" },
    });
    if (!record) return NextResponse.json({ error: "No reported maintenance found" }, { status: 400 });
    await db.bedMaintenance.update({
      where: { id: record.id },
      data: { status: "in_progress", startedAt: new Date(), technicianName: technicianName || null },
    });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId: bed.facilityId,
      action: "BED_MAINTENANCE_STARTED", resourceType: "bed", resourceId: id,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "resolve") {
    const record = await db.bedMaintenance.findFirst({
      where: { bedId: id, status: { in: ["reported", "in_progress"] } },
      orderBy: { reportedAt: "desc" },
    });
    if (!record) return NextResponse.json({ error: "No active maintenance found" }, { status: 400 });
    await db.bedMaintenance.update({
      where: { id: record.id },
      data: { status: "resolved", completedAt: new Date(), notes: notes || record.notes },
    });
    await db.bed.update({ where: { id }, data: { status: "available" } });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId: bed.facilityId,
      action: "BED_MAINTENANCE_RESOLVED", resourceType: "bed", resourceId: id,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
