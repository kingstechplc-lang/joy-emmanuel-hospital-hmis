// =====================================================================
// API: /api/mortuary/[id]/movements
//   GET  — list movements for a case (timeline)
//   POST — add a movement record
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
  const movements = await db.mortuaryMovement.findMany({
    where: { mortuaryAdmissionId: id },
    orderBy: { movedAt: "asc" },
  });
  return NextResponse.json({ items: movements, count: movements.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MORTUARY_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  let body: any;
  try { const text = await req.text(); body = text ? JSON.parse(text) : {}; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { movementType } = body;
  if (!movementType) return NextResponse.json({ error: "movementType is required" }, { status: 400 });

  const admission = await db.mortuaryAdmission.findUnique({ where: { id } });
  if (!admission || admission.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const item = await db.mortuaryMovement.create({
    data: {
      ...body,
      mortuaryAdmissionId: id,
      organizationId: session.user.organizationId,
      movedById: session.user.id,
      movedByName: session.user.name || session.user.username,
    },
  });

  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: `MORTUARY_MOVEMENT_${movementType.toUpperCase()}`, resourceType: "mortuary_movement", resourceId: item.id });
  return NextResponse.json({ item }, { status: 201 });
}
