// =====================================================================
// API: /api/ward-rounds/[id]/actions
//   GET  — list action items for a round
//   POST — create an action item
//   PATCH — complete/cancel action item
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.WARD_ROUND_VIEW) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const actions = await db.wardRoundAction.findMany({
    where: { wardRoundId: id },
    include: { patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } } },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ items: actions, count: actions.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.WARD_ROUND_ACTION_MANAGE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const round = await db.wardRound.findUnique({ where: { id } });
  if (!round) return NextResponse.json({ error: "Ward round not found" }, { status: 404 });
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { patientId, wardRoundPatientId, actionType, title, description, assignedToId, assignedToName, assignedToRole, dueDate, priority } = body;
  if (!title || !actionType) return NextResponse.json({ error: "title and actionType are required" }, { status: 400 });
  const item = await db.wardRoundAction.create({
    data: {
      wardRoundId: id, wardRoundPatientId: wardRoundPatientId || null,
      patientId: patientId || null, facilityId: round.facilityId,
      actionType, title, description: description || null,
      assignedToId: assignedToId || null, assignedToName: assignedToName || null, assignedToRole: assignedToRole || null,
      dueDate: dueDate ? new Date(dueDate) : null, priority: priority || "routine",
      createdById: session.user.id,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: round.facilityId, action: "WARD_ROUND_ACTION_CREATED", resourceType: "ward_round_action", resourceId: item.id, newValues: { title, actionType, patientId } });
  return NextResponse.json({ item }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.WARD_ROUND_ACTION_MANAGE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { actionId, action, completionNotes } = body;
  if (!actionId) return NextResponse.json({ error: "actionId is required" }, { status: 400 });
  const existing = await db.wardRoundAction.findUnique({ where: { id: actionId } });
  if (!existing || existing.wardRoundId !== id) return NextResponse.json({ error: "Action not found" }, { status: 404 });

  if (action === "complete") {
    const updated = await db.wardRoundAction.update({ where: { id: actionId }, data: { status: "completed", completedAt: new Date(), completedById: session.user.id, completionNotes: completionNotes || null } });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "WARD_ROUND_ACTION_COMPLETED", resourceType: "ward_round_action", resourceId: actionId });
    return NextResponse.json({ item: updated });
  }
  if (action === "cancel") {
    const updated = await db.wardRoundAction.update({ where: { id: actionId }, data: { status: "cancelled", completionNotes: completionNotes || "Cancelled" } });
    return NextResponse.json({ item: updated });
  }
  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
