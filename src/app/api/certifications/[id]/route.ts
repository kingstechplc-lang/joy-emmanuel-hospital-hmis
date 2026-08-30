// API: /api/certifications/[id] — GET / PATCH / DELETE
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW) && !hasPermission(session, PERMISSIONS.CERTIFICATION_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.certification.findUnique({
    where: { id },
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true } },
      certificationType: true,
      issuer: true,
      verifiedBy: { select: { id: true, firstName: true, lastName: true } },
      verifications: { orderBy: { createdAt: "desc" }, include: { verifiedBy: { select: { id: true, firstName: true, lastName: true } } } },
      renewals: { orderBy: { createdAt: "desc" } },
      statusHistory: { orderBy: { createdAt: "desc" }, take: 20, include: { changedBy: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_EDIT) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.certification.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body, updatedById: session.user.id };
  if (updateData.issueDate) updateData.issueDate = new Date(updateData.issueDate);
  if (updateData.expiryDate) updateData.expiryDate = new Date(updateData.expiryDate);
  if (updateData.effectiveDate) updateData.effectiveDate = new Date(updateData.effectiveDate);
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.certification.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_UPDATED", resourceType: "certification", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_DELETE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.certification.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Soft delete — archive, never permanently delete
  await db.certification.update({ where: { id }, data: { status: "archived" } });
  await db.certificationStatusHistory.create({ data: { certificationId: id, previousStatus: existing.status, newStatus: "archived", changedById: session.user.id, reason: "Archived" } }).catch(() => {});
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_ARCHIVED", resourceType: "certification", resourceId: id });
  return NextResponse.json({ ok: true });
}
