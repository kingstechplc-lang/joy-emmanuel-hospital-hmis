// =====================================================================
// API: /api/medications/[id]
//   PATCH  — update medication
//   DELETE — soft-delete medication
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
  if (!hasPermission(session, PERMISSIONS.PHARMACY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const med = await db.medication.findUnique({ where: { id } });
  if (!med || med.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item: med });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
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
  const { genericName, brandName, strength, dosageForm, route, unit, description, status } = body;

  const existing = await db.medication.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateData: any = {};
  if (typeof genericName === "string") updateData.genericName = genericName;
  if (typeof brandName === "string") updateData.brandName = brandName || null;
  if (typeof strength === "string") updateData.strength = strength || null;
  if (typeof dosageForm === "string") updateData.dosageForm = dosageForm || null;
  if (typeof route === "string") updateData.route = route || null;
  if (typeof unit === "string") updateData.unit = unit || null;
  if (typeof description === "string") updateData.description = description || null;
  if (typeof status === "string") updateData.status = status;

  const updated = await db.medication.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "MEDICATION_UPDATED",
    resourceType: "medication",
    resourceId: id,
    oldValues: { genericName: existing.genericName, brandName: existing.brandName },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.medication.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.medication.update({ where: { id }, data: { status: "inactive" } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "MEDICATION_DELETED",
    resourceType: "medication",
    resourceId: id,
    oldValues: { genericName: existing.genericName },
  });
  return NextResponse.json({ ok: true });
}
