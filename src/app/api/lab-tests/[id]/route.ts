// =====================================================================
// API: /api/lab-tests/[id]
//   PATCH  — update lab test
//   DELETE — delete lab test (soft)
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
  if (!hasPermission(session, PERMISSIONS.LAB_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const test = await db.laboratoryTest.findUnique({ where: { id } });
  if (!test || test.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item: test });
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
  const { name, code, category, specimenType, unit, referenceRange, price, status, configuration } = body;

  const existing = await db.laboratoryTest.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateData: any = {};
  if (typeof name === "string") updateData.name = name;
  if (typeof code === "string") updateData.code = code;
  if (typeof category === "string") updateData.category = category || null;
  if (typeof specimenType === "string") updateData.specimenType = specimenType || null;
  if (typeof unit === "string") updateData.unit = unit || null;
  if (typeof referenceRange === "string") updateData.referenceRange = referenceRange || null;
  if (typeof price === "number") updateData.price = price;
  if (typeof status === "string") updateData.status = status;
  if (typeof configuration === "string") updateData.configuration = configuration || null;

  const updated = await db.laboratoryTest.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "LAB_TEST_UPDATED",
    resourceType: "laboratory_test",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code, price: existing.price },
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
  const existing = await db.laboratoryTest.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.laboratoryTest.update({ where: { id }, data: { status: "inactive" } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "LAB_TEST_DELETED",
    resourceType: "laboratory_test",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code },
  });
  return NextResponse.json({ ok: true });
}
