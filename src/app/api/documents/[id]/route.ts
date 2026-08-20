// =====================================================================
// API: /api/documents/[id]
//   GET    — fetch single document
//   PATCH  — update document metadata
//   DELETE — soft-delete document (status = "deleted")
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
  if (!hasPermission(session, PERMISSIONS.DOCUMENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const doc = await db.document.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } },
      uploadedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      facility: { select: { id: true, name: true, code: true } },
    },
  });

  if (!doc || doc.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ item: doc });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DOCUMENT_UPLOAD)) {
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
  const { fileName, fileUrl, documentType, visibility, mimeType, fileSize, status } = body;

  const existing = await db.document.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateData: any = {};
  if (typeof fileName === "string") updateData.fileName = fileName;
  if (typeof fileUrl === "string") updateData.fileUrl = fileUrl;
  if (documentType) updateData.documentType = documentType;
  if (visibility) updateData.visibility = visibility;
  if (typeof mimeType === "string") updateData.mimeType = mimeType;
  if (fileSize) updateData.fileSize = Number(fileSize);
  if (status) updateData.status = status;

  const updated = await db.document.update({ where: { id }, data: updateData });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "DOCUMENT_UPDATED",
    resourceType: "document",
    resourceId: id,
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DOCUMENT_DELETE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.document.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Soft-delete
  await db.document.update({ where: { id }, data: { status: "deleted" } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "DOCUMENT_DELETED",
    resourceType: "document",
    resourceId: id,
    oldValues: { fileName: existing.fileName, documentType: existing.documentType },
  });

  return NextResponse.json({ ok: true });
}
