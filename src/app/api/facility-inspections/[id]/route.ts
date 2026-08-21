// =====================================================================
// API: /api/facility-inspections/[id]
//   PATCH — update inspection
//   DELETE — remove inspection
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SUPPORT_SERVICES_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const existing = await db.facilityInspection.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { id: _id, organizationId: _org, createdAt: _c, updatedAt: _u, createdById: _cb, ...updateData } = body;
  const updated = await db.facilityInspection.update({ where: { id }, data: updateData });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "FACILITY_INSPECTION_UPDATED",
    resourceType: "facility_inspection",
    resourceId: id,
  });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SUPPORT_SERVICES_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.facilityInspection.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.facilityInspection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
