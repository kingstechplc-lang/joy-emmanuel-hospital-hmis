// =====================================================================
// API: /api/shift-swaps/[id] — GET / PATCH (cancel only) / DELETE
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const item = await db.shiftSwap.findUnique({
    where: { id },
    include: {
      requesterStaff: { select: { id: true, staffNumber: true, firstName: true, lastName: true } },
      targetStaff: { select: { id: true, staffNumber: true, firstName: true, lastName: true } },
      requesterShift: { include: { staff: true, facility: true, department: true } },
      targetShift: { include: { staff: true, facility: true, department: true } },
    },
  });
  if (!item || item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_SWAP_REQUEST) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.shiftSwap.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updateData: any = {};
  if (body.reason !== undefined) updateData.reason = body.reason;
  // Status changes via dedicated routes (accept/reject/approve/cancel)
  // Generic PATCH only allows cancellation by requester
  if (body.action === "cancel") {
    if (existing.status === "completed") {
      return NextResponse.json({ error: "Cannot cancel a completed swap." }, { status: 400 });
    }
    updateData.status = "cancelled";
    updateData.rejectionReason = body.reason || "Cancelled by requester";
  }

  const updated = await db.shiftSwap.update({ where: { id }, data: updateData });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SHIFT_SWAP_UPDATED",
    resourceType: "shift_swap",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.shiftSwap.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.shiftSwap.delete({ where: { id } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SHIFT_SWAP_DELETED",
    resourceType: "shift_swap",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
