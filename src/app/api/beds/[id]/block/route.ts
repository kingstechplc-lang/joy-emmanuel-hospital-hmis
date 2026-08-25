// =====================================================================
// API: /api/beds/[id]/block
//   GET  — list block records for a bed
//   POST — block/unblock a bed
//   Body: { action: "block" | "unblock", reason, reasonDetails, expectedEnd, notes }
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
  const blocks = await db.bedBlock.findMany({
    where: { bedId: id },
    orderBy: { blockedAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ items: blocks, count: blocks.length });
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
  const { action, reason, reasonDetails, expectedEnd, notes } = body;

  if (action === "block") {
    if (bed.status === "occupied") {
      return NextResponse.json({ error: "Cannot block an occupied bed. Release the patient first." }, { status: 400 });
    }
    const block = await db.bedBlock.create({
      data: {
        bedId: id, facilityId: bed.facilityId,
        status: "active",
        reason: reason || "other",
        reasonDetails: reasonDetails || null,
        expectedEnd: expectedEnd ? new Date(expectedEnd) : null,
        blockedById: session.user.id,
        notes: notes || null,
      },
    });
    await db.bed.update({ where: { id }, data: { status: "blocked" } });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId: bed.facilityId,
      action: "BED_BLOCKED", resourceType: "bed", resourceId: id,
      newValues: { reason, reasonDetails, expectedEnd },
    });
    return NextResponse.json({ item: block }, { status: 201 });
  }

  if (action === "unblock") {
    const block = await db.bedBlock.findFirst({
      where: { bedId: id, status: "active" },
      orderBy: { blockedAt: "desc" },
    });
    if (!block) return NextResponse.json({ error: "No active block found" }, { status: 400 });
    await db.bedBlock.update({
      where: { id: block.id },
      data: { status: "removed", actualEnd: new Date() },
    });
    await db.bed.update({ where: { id }, data: { status: "available" } });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId, facilityId: bed.facilityId,
      action: "BED_UNBLOCKED", resourceType: "bed", resourceId: id,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
