// =====================================================================
// API: /api/blood-bank/crossmatch/[id] — PATCH + DELETE
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
  const existing = await db.bloodCrossmatch.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id: _id, organizationId: _org, createdAt: _c, updatedAt: _u, ...updateData } = body;
  const updated = await db.bloodCrossmatch.update({ where: { id }, data: updateData });
  
  // If result updated to compatible, auto-reserve the unit
  if (updateData.crossmatchResult === "compatible") {
    const unit = await db.bloodUnit.findUnique({ where: { id: existing.unitId } });
    if (unit && unit.status === "available") {
      await db.bloodUnit.update({
        where: { id: unit.id },
        data: { status: "reserved", reservedForPatientName: existing.patientName },
      });
    }
  }
  
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "BLOOD_CROSSMATCH_UPDATED", resourceType: "blood_crossmatch", resourceId: id });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.BLOODBANK_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.bloodCrossmatch.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.bloodCrossmatch.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
