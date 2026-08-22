// =====================================================================
// API: /api/specialty/referrals/[id]
//   GET    — fetch single referral
//   PATCH  — update referral (accept/decline/schedule/complete)
//   DELETE — remove referral
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
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const item = await db.specialtyReferral.findUnique({ where: { id } });
  if (!item || item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_REFERRALS) && !hasPermission(session, PERMISSIONS.SPECIALTY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const existing = await db.specialtyReferral.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id: _id, organizationId: _orgId, createdAt: _c, updatedAt: _u, createdById: _cb, ...updateData } = body;

  // Auto-set responseDate when status changes from "pending"
  if (updateData.status && updateData.status !== "pending" && !existing.responseDate) {
    updateData.responseDate = new Date();
  }

  const updated = await db.specialtyReferral.update({
    where: { id },
    data: updateData,
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "SPECIALTY_REFERRAL_UPDATED",
    resourceType: "specialtyReferral",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.specialtyReferral.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.specialtyReferral.delete({ where: { id } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SPECIALTY_REFERRAL_DELETED",
    resourceType: "specialtyReferral",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
