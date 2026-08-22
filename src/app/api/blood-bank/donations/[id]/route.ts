// =====================================================================
// API: /api/blood-bank/donations/[id] — PATCH + DELETE
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
  if (!hasPermission(session, PERMISSIONS.BLOODBANK_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const existing = await db.bloodDonation.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id: _id, organizationId: _org, createdAt: _c, updatedAt: _u, createdById: _cb, ...updateData } = body;
  const updated = await db.bloodDonation.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "BLOOD_DONATION_UPDATED", resourceType: "blood_donation", resourceId: id });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BLOODBANK_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.bloodDonation.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.bloodDonation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
