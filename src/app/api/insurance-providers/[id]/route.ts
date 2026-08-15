// =====================================================================
// API: /api/insurance-providers/[id]
//   GET    — fetch provider
//   PATCH  — update provider
//   DELETE — soft-delete provider (status = "inactive")
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const provider = await db.insuranceProvider.findUnique({ where: { id } });
  if (!provider || provider.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item: provider });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, code, phone, email, address, status } = body;

  const existing = await db.insuranceProvider.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateData: any = {};
  if (typeof name === "string") updateData.name = name;
  if (typeof code === "string") updateData.code = code;
  if (typeof phone === "string") updateData.phone = phone || null;
  if (typeof email === "string") updateData.email = email || null;
  if (typeof address === "string") updateData.address = address || null;
  if (typeof status === "string") updateData.status = status;

  // Check code uniqueness
  if (updateData.code && updateData.code !== existing.code) {
    const codeOwner = await db.insuranceProvider.findUnique({
      where: { organizationId_code: { organizationId: existing.organizationId, code: updateData.code } },
    });
    if (codeOwner && codeOwner.id !== id) {
      return NextResponse.json({ error: "Code already in use" }, { status: 409 });
    }
  }

  const updated = await db.insuranceProvider.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "INSURANCE_PROVIDER_UPDATED",
    resourceType: "insurance_provider",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code, status: existing.status },
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
  const existing = await db.insuranceProvider.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.insuranceProvider.update({ where: { id }, data: { status: "inactive" } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "INSURANCE_PROVIDER_DELETED",
    resourceType: "insurance_provider",
    resourceId: id,
    oldValues: { name: existing.name, code: existing.code },
  });
  return NextResponse.json({ ok: true });
}
