// =====================================================================
// API: /api/record-requests/[id]
//   GET    — fetch single record request with movements
//   PATCH  — update status (creates movement record automatically)
//   DELETE — remove
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
  if (!hasPermission(session, PERMISSIONS.PATIENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const item = await db.recordRequest.findUnique({
    where: { id },
    include: { movements: { orderBy: { movedAt: "desc" } } },
  });
  if (!item || item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const existing = await db.recordRequest.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id: _id, organizationId: _org, createdAt: _c, updatedAt: _u, createdById: _cb, requestNumber: _rn, ...updateData } = body;

  // Handle date conversions
  for (const k of ["requiredBy", "retrievedAt", "issuedAt", "returnedAt", "closedAt"]) {
    if (updateData[k]) {
      try { updateData[k] = new Date(updateData[k]); } catch {}
    }
  }

  const oldStatus = existing.status;
  const newStatus = updateData.status;

  // Auto-set timestamps based on status change
  if (newStatus && newStatus !== oldStatus) {
    const now = new Date();
    if (newStatus === "retrieving" && !existing.retrievedAt) updateData.retrievedAt = now;
    if (newStatus === "issued" && !existing.issuedAt) updateData.issuedAt = now;
    if (newStatus === "returned" && !existing.returnedAt) updateData.returnedAt = now;
    if (newStatus === "closed" && !existing.closedAt) updateData.closedAt = now;
  }

  const updated = await db.recordRequest.update({ where: { id }, data: updateData });

  // Create movement record on status change
  if (newStatus && newStatus !== oldStatus) {
    const movementTypeMap: Record<string, string> = {
      approved: "retrieving",
      retrieving: "retrieved",
      issued: "issued",
      in_use: "issued",
      returned: "returned",
      closed: "returned",
    };
    const mt = movementTypeMap[newStatus] || newStatus;
    const locationMap: Record<string, string> = {
      requested: "Records Desk",
      approved: "Records Desk",
      retrieving: "Records Desk",
      issued: existing.requestingDepartment || "Department",
      in_use: existing.requestingDepartment || "Department",
      returned: "Records Desk",
      closed: "Records Desk",
    };
    await db.recordMovement.create({
      data: {
        recordRequestId: id,
        patientId: existing.patientId,
        patientName: existing.patientName,
        patientNumber: existing.patientNumber,
        movementType: mt,
        fromLocation: locationMap[oldStatus] || null,
        toLocation: locationMap[newStatus] || null,
        departmentCode: existing.requestingDepartment,
        staffName: session.user.name,
        notes: `Status changed from ${oldStatus} to ${newStatus}`,
        createdById: session.user.id,
      },
    });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "RECORD_REQUEST_UPDATED",
    resourceType: "record_request",
    resourceId: id,
    oldValues: { status: oldStatus },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_EDIT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.recordRequest.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.recordRequest.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
