// =====================================================================
// API: /api/record-amendments/[id]
//   PATCH  — approve/reject/apply amendment
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
  if (!hasPermission(session, PERMISSIONS.PATIENT_EDIT)) {
    return NextResponse.json({ error: "Forbidden — patient.edit permission required" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const existing = await db.recordAmendment.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id: _id, organizationId: _org, createdAt: _c, updatedAt: _u, requestedById: _rb, requestedByName: _rn, ...updateData } = body;

  // Auto-set approval fields
  if (updateData.status === "approved" || updateData.status === "rejected") {
    updateData.approvedById = session.user.id;
    updateData.approvedByName = session.user.name || session.user.username;
    updateData.approvedAt = new Date();
  }
  if (updateData.status === "applied") {
    updateData.appliedAt = new Date();
  }

  const updated = await db.recordAmendment.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: `RECORD_AMENDMENT_${(updateData.status || "").toUpperCase()}`,
    resourceType: "record_amendment",
    resourceId: id,
    oldValues: { status: existing.status },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}
