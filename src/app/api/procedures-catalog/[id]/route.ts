// =====================================================================
// API: /api/procedures-catalog/[id]
//   GET    — single catalog entry
//   PATCH  — update fields
//   DELETE — soft delete (status=inactive)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PROCEDURE_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.procedureCatalog.findUnique({
    where: { id },
    include: { facilityAvailability: true },
  });
  if (!item || item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const allowed = session.user.roles.includes("super_admin") ||
    session.user.permissions?.includes(PERMISSIONS.SETTINGS_MANAGE) ||
    session.user.permissions?.includes(PERMISSIONS.PROCEDURE_PERFORM);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const existing = await db.procedureCatalog.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const updateData: any = {};
  const fields = [
    "name", "code", "shortName", "description", "category", "procedureType",
    "departmentId", "requiredStaffType", "estimatedDurationMinutes",
    "serviceId", "isBillable", "billableAs",
    "nhisEligible", "nhisServiceCode", "nhisTariffRef", "claimableStatus",
    "requiredConsumables", "status",
  ];
  for (const f of fields) {
    if (body[f] !== undefined) {
      if (f === "isBillable" || f === "nhisEligible") updateData[f] = !!body[f];
      else if (f === "estimatedDurationMinutes") updateData[f] = typeof body[f] === "number" ? body[f] : null;
      else updateData[f] = body[f] || null;
    }
  }
  updateData.updatedById = session.user.id;
  const updated = await db.procedureCatalog.update({ where: { id }, data: updateData });
  await auditLog({
    userId: session.user.id, organizationId: session.user.organizationId,
    action: "PROCEDURE_CATALOG_UPDATED", resourceType: "procedure_catalog", resourceId: id,
    newValues: updateData,
  });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const allowed = session.user.roles.includes("super_admin") ||
    session.user.permissions?.includes(PERMISSIONS.SETTINGS_MANAGE);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.procedureCatalog.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.procedureCatalog.update({ where: { id }, data: { status: "inactive" } });
  await auditLog({
    userId: session.user.id, organizationId: session.user.organizationId,
    action: "PROCEDURE_CATALOG_ARCHIVED", resourceType: "procedure_catalog", resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
