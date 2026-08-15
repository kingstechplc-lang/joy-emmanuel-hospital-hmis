// =====================================================================
// API: /api/facilities/[id]
//   GET    — fetch a facility (with counts)
//   PATCH  — update facility
//   DELETE — delete facility (only if no associated records)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const facility = await db.facility.findUnique({
    where: { id },
    include: {
      _count: { select: { departments: true, beds: true, staffFacilities: true, wards: true } },
      departments: { select: { id: true, name: true, code: true, status: true } },
    },
  });

  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Facility not found" }, { status: 404 });
  }

  return NextResponse.json({ item: facility, facility });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.FACILITY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const existing = await db.facility.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Facility not found" }, { status: 404 });
  }

  const updateData: any = {};
  for (const k of [
    "name",
    "code",
    "facilityType",
    "address",
    "city",
    "region",
    "country",
    "phone",
    "email",
    "status",
    "timezone",
    "description",
  ]) {
    if (body[k] !== undefined) updateData[k] = body[k] || null;
  }

  // Check code uniqueness if changing
  if (updateData.code && updateData.code !== existing.code) {
    const codeOwner = await db.facility.findUnique({
      where: { organizationId_code: { organizationId: existing.organizationId, code: updateData.code } },
    });
    if (codeOwner && codeOwner.id !== id) {
      return NextResponse.json({ error: "Facility code already in use" }, { status: 409 });
    }
  }

  const updated = await db.facility.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: id,
    action: "FACILITY_UPDATED",
    resourceType: "facility",
    resourceId: id,
    oldValues: {
      name: existing.name,
      code: existing.code,
      city: existing.city,
      status: existing.status,
    },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.FACILITY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.facility.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Facility not found" }, { status: 404 });
  }

  try {
    await db.facility.delete({ where: { id } });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "FACILITY_DELETED",
      resourceType: "facility",
      resourceId: id,
      oldValues: { name: existing.name, code: existing.code },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Cannot delete facility with associated records. Consider deactivating instead." },
      { status: 400 }
    );
  }
}
