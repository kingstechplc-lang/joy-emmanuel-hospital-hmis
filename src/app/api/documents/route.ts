// =====================================================================
// API: /api/documents
//   GET  — list documents (filter by facility, patient, type, uploader)
//   POST — upload document metadata
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DOCUMENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const patientId = url.searchParams.get("patientId");
  const documentType = url.searchParams.get("documentType");
  const visibility = url.searchParams.get("visibility");
  const q = url.searchParams.get("q") || "";

  // Scope facilities to user's org
  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) where.facilityId = facilityId;
  else where.facilityId = { in: orgFacilityIds };
  if (patientId) where.patientId = patientId;
  if (documentType) where.documentType = documentType;
  if (visibility) where.visibility = visibility;
  if (q) where.fileName = { contains: q };

  const docs = await db.document.findMany({
    where,
    orderBy: { uploadedAt: "desc" },
    take: 200,
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } },
      uploadedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      facility: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json({ items: docs, count: docs.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DOCUMENT_UPLOAD)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const {
    patientId,
    encounterId,
    facilityId,
    documentType,
    fileName,
    fileUrl,
    mimeType,
    fileSize,
    visibility,
  } = body;

  if (!fileName || !fileUrl) {
    return NextResponse.json({ error: "fileName and fileUrl are required" }, { status: 400 });
  }

  // Validate facility scope
  let resolvedFacilityId = facilityId;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  } else {
    resolvedFacilityId = session.user.facilityId || null;
  }

  const doc = await db.document.create({
    data: {
      organizationId: session.user.organizationId,
      patientId: patientId || null,
      encounterId: encounterId || null,
      facilityId: resolvedFacilityId,
      documentType: documentType || "other",
      fileName,
      fileUrl,
      mimeType: mimeType || null,
      fileSize: fileSize ? Number(fileSize) : null,
      uploadedById: session.user.id,
      visibility: visibility || "facility",
      status: "active",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "DOCUMENT_UPLOADED",
    resourceType: "document",
    resourceId: doc.id,
    newValues: { fileName, documentType, patientId, encounterId, visibility },
  });

  return NextResponse.json({ item: doc }, { status: 201 });
}
