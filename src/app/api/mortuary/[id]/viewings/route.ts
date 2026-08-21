// =====================================================================
// API: /api/mortuary/[id]/viewings
//   GET  — list viewings for a case
//   POST — schedule a viewing
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
  if (!hasPermission(session, PERMISSIONS.MORTUARY_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const admission = await db.mortuaryAdmission.findUnique({ where: { id } });
  if (!admission || admission.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const viewings = await db.mortuaryViewing.findMany({
    where: { mortuaryAdmissionId: id },
    orderBy: { scheduledAt: "desc" },
  });
  return NextResponse.json({ items: viewings, count: viewings.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MORTUARY_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  let body: any;
  try { const text = await req.text(); body = text ? JSON.parse(text) : {}; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { viewerName, scheduledAt } = body;
  if (!viewerName || !scheduledAt) return NextResponse.json({ error: "viewerName and scheduledAt are required" }, { status: 400 });

  const admission = await db.mortuaryAdmission.findUnique({ where: { id } });
  if (!admission || admission.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { id: _id, organizationId: _org, createdAt: _c, updatedAt: _u, createdById: _cb, facilityId: _f, mortuaryAdmissionId: _ma, ...createData } = body;
  const item = await db.mortuaryViewing.create({
    data: {
      ...createData,
      mortuaryAdmissionId: id,
      organizationId: session.user.organizationId,
      facilityId: admission.facilityId,
      createdById: session.user.id,
      scheduledAt: new Date(scheduledAt),
    },
  });

  // Auto-create movement record
  await db.mortuaryMovement.create({
    data: {
      organizationId: session.user.organizationId,
      mortuaryAdmissionId: id,
      movementType: "viewed",
      fromLocation: admission.storageLocation || "Storage",
      toLocation: "Viewing Room",
      movedById: session.user.id,
      movedByName: session.user.name,
      reason: `Viewing scheduled for ${viewerName}`,
      notes: `Status: ${createData.status || "requested"}`,
    },
  });

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "MORTUARY_VIEWING_SCHEDULED", resourceType: "mortuary_viewing", resourceId: item.id });
  return NextResponse.json({ item }, { status: 201 });
}
