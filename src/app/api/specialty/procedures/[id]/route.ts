// =====================================================================
// API: /api/specialty/procedures/[id]
//   PATCH  — update procedure (e.g., mark completed, add findings)
//   DELETE — remove procedure
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
  if (!hasPermission(session, PERMISSIONS.SPECIALTY_MANAGE)) {
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

  const existing = await db.specialtyProcedure.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id: _id, organizationId: _orgId, createdAt: _c, updatedAt: _u, ...updateData } = body;

  // Auto-set endedAt + duration when status flips to completed
  if (updateData.status === "completed" && existing.status !== "completed") {
    updateData.endedAt = new Date();
    if (!updateData.durationMin && existing.startedAt) {
      updateData.durationMin = Math.round((Date.now() - new Date(existing.startedAt).getTime()) / 60000);
    }
  }

  const updated = await db.specialtyProcedure.update({
    where: { id },
    data: updateData,
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SPECIALTY_PROCEDURE_UPDATED",
    resourceType: "specialtyProcedure",
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
  const existing = await db.specialtyProcedure.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.specialtyProcedure.delete({ where: { id } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "SPECIALTY_PROCEDURE_DELETED",
    resourceType: "specialtyProcedure",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
