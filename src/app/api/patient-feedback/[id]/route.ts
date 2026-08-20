// =====================================================================
// API: /api/patient-feedback/[id]
//   GET    — fetch single patient feedback
//   PATCH  — update patient feedback
//   DELETE — remove patient feedback
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
  if (!hasPermission(session, PERMISSIONS.PATIENT_RELATIONS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const item = await db.patientFeedback.findUnique({ where: { id } });
  if (!item || item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_RELATIONS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  const existing = await db.patientFeedback.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Strip protected fields
  const { id: _id, organizationId: _orgId, createdAt: _c, updatedAt: _u, createdById: _cb, ...updateData } = body;

  const updated = await db.patientFeedback.update({
    where: { id },
    data: updateData,
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "PATIENT_FEEDBACK_UPDATED",
    resourceType: "patientFeedback",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_RELATIONS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.patientFeedback.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.patientFeedback.delete({ where: { id } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "PATIENT_FEEDBACK_DELETED",
    resourceType: "patientFeedback",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
