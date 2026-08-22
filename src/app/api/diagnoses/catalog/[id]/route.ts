// =====================================================================
// API: /api/diagnoses/catalog/[id]
//   PATCH  — update a catalog entry
//   DELETE — remove a catalog entry (soft delete via isActive=false preferred)
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
  if (!hasPermission(session, PERMISSIONS.DIAGNOSIS_CATALOG_MANAGE)) {
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

  const existing = await db.diagnosisCatalog.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id: _id, organizationId: _o, createdAt: _c, updatedAt: _u, ...updateData } = body;

  // If code or codeSystem is changing, check for duplicate
  if (updateData.code || updateData.codeSystem) {
    const newCode = updateData.code || existing.code;
    const newSystem = updateData.codeSystem || existing.codeSystem;
    if (newCode !== existing.code || newSystem !== existing.codeSystem) {
      const dup = await db.diagnosisCatalog.findUnique({
        where: {
          organizationId_code_codeSystem: {
            organizationId: session.user.organizationId,
            code: newCode,
            codeSystem: newSystem,
          },
        },
      });
      if (dup && dup.id !== id) {
        return NextResponse.json({ error: `Another diagnosis with code "${newCode}" (${newSystem}) already exists` }, { status: 409 });
      }
    }
  }

  const updated = await db.diagnosisCatalog.update({
    where: { id },
    data: updateData,
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "DIAGNOSIS_CATALOG_UPDATED",
    resourceType: "diagnosisCatalog",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DIAGNOSIS_CATALOG_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.diagnosisCatalog.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check if any encounter diagnoses reference this catalog entry
  const usageCount = await db.diagnosis.count({ where: { catalogId: id } });
  if (usageCount > 0) {
    // Soft-delete by deactivating — preserve historical references
    await db.diagnosisCatalog.update({ where: { id }, data: { isActive: false } });
    await auditLog({
      userId: session.user.id,
      organizationId: session.user.organizationId,
      action: "DIAGNOSIS_CATALOG_DEACTIVATED",
      resourceType: "diagnosisCatalog",
      resourceId: id,
      newValues: { reason: `Deactivated (used by ${usageCount} encounter diagnoses)` },
    });
    return NextResponse.json({ ok: true, deactivated: true, reason: `${usageCount} historical diagnoses reference this entry — deactivated instead of deleted` });
  }

  await db.diagnosisCatalog.delete({ where: { id } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "DIAGNOSIS_CATALOG_DELETED",
    resourceType: "diagnosisCatalog",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
