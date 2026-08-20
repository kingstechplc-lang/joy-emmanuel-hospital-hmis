// =====================================================================
// API: /api/mortuary/[id]
//   PATCH — update admission details
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
  if (!hasPermission(session, PERMISSIONS.MORTUARY_MANAGE)) {
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

  const existing = await db.mortuaryAdmission.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Admission not found" }, { status: 404 });
  }

  const allowedFields = [
    "deceasedAge", "deceasedSex", "deceasedDob", "nationalId",
    "nextOfKinName", "nextOfKinPhone", "nextOfKinRelation",
    "placeOfDeath", "causeOfDeath", "deathCertificateNo",
    "broughtBy", "broughtByPhone", "sourceFacility", "sourceNotes",
    "storageUnitId", "storageLocation", "bodyTag", "admissionStatus",
  ];

  const data: any = {};
  for (const f of allowedFields) {
    if (body[f] !== undefined) {
      if (f === "deceasedDob" && body[f]) {
        data[f] = new Date(body[f]);
      } else {
        data[f] = body[f];
      }
    }
  }

  if (data.admissionStatus === "stored" && existing.admissionStatus === "admitted") {
    // mark as stored
  }

  const updated = await db.mortuaryAdmission.update({ where: { id }, data });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "MORTUARY_ADMISSION_UPDATED",
    resourceType: "mortuary_admission",
    resourceId: id,
    oldValues: { status: existing.admissionStatus },
    newValues: data,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MORTUARY_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.mortuaryAdmission.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Admission not found" }, { status: 404 });
  }

  await db.mortuaryAdmission.delete({ where: { id } });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "MORTUARY_ADMISSION_DELETED",
    resourceType: "mortuary_admission",
    resourceId: id,
    oldValues: { admissionNumber: existing.admissionNumber, deceasedName: existing.deceasedName },
  });

  return NextResponse.json({ ok: true });
}
