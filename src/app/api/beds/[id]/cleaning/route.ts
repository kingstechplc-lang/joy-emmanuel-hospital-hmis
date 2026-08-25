// =====================================================================
// API: /api/beds/[id]/cleaning
//   GET  — list cleaning records for a bed
//   POST — start/complete cleaning workflow
//   Body: { action: "start" | "complete" | "skip", cleaningType, notes, cleanedById }
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
  const cleanings = await db.bedCleaning.findMany({
    where: { bedId: id },
    orderBy: { initiatedAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ items: cleanings, count: cleanings.length });
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
  const { action, cleaningType, notes, cleanedById } = body;

  if (action === "start") {
    // Create a cleaning record + set bed status to cleaning
    const cleaning = await db.bedCleaning.create({
      data: {
        bedId: id,
        facilityId: bed.facilityId,
        status: "in_progress",
        startedAt: new Date(),
        initiatedById: session.user.id,
        cleaningType: cleaningType || "routine",
        notes: notes || null,
      },
    });
    await db.bed.update({ where: { id }, data: { status: "cleaning" } });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId: bed.facilityId,
      action: "BED_CLEANING_STARTED", resourceType: "bed", resourceId: id,
      newValues: { cleaningId: cleaning.id, cleaningType },
    });
    return NextResponse.json({ item: cleaning }, { status: 201 });
  }

  if (action === "complete") {
    // Find the latest in-progress cleaning and complete it
    const cleaning = await db.bedCleaning.findFirst({
      where: { bedId: id, status: { in: ["pending", "in_progress"] } },
      orderBy: { initiatedAt: "desc" },
    });
    if (!cleaning) return NextResponse.json({ error: "No active cleaning found" }, { status: 400 });
    await db.bedCleaning.update({
      where: { id: cleaning.id },
      data: { status: "completed", completedAt: new Date(), cleanedById: cleanedById || session.user.id, notes: notes || cleaning.notes },
    });
    // Set bed back to available
    await db.bed.update({ where: { id }, data: { status: "available" } });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId: bed.facilityId,
      action: "BED_CLEANING_COMPLETED", resourceType: "bed", resourceId: id,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "skip") {
    const cleaning = await db.bedCleaning.findFirst({
      where: { bedId: id, status: { in: ["pending", "in_progress"] } },
      orderBy: { initiatedAt: "desc" },
    });
    if (cleaning) {
      await db.bedCleaning.update({
        where: { id: cleaning.id },
        data: { status: "skipped", completedAt: new Date(), notes: notes || "Skipped" },
      });
    }
    await db.bed.update({ where: { id }, data: { status: "available" } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
