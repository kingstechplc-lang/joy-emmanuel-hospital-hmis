// =====================================================================
// API: /api/nursing/tasks
//   GET  — list nursing tasks (filter by patientId, status, assignedToId)
//   POST — create a nursing task
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.NURSING_VIEW) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const status = url.searchParams.get("status");
  const assignedToId = url.searchParams.get("assignedToId");
  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (status) where.status = status;
  if (assignedToId) where.assignedToId = assignedToId;
  const items = await db.nursingTask.findMany({ where, orderBy: { dueAt: "asc" }, take: 200 });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.NURSING_TASK_MANAGE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { patientId, admissionId, encounterId, facilityId, wardId, taskType, title, description, dueAt, frequency, assignedToId } = body;
  if (!patientId || !title || !dueAt) return NextResponse.json({ error: "patientId, title, and dueAt are required" }, { status: 400 });
  const item = await db.nursingTask.create({
    data: {
      patientId, admissionId: admissionId || null, encounterId: encounterId || null,
      facilityId: facilityId || null, wardId: wardId || null,
      taskType: taskType || "other", title, description: description || null,
      dueAt: new Date(dueAt), frequency: frequency || null,
      assignedToId: assignedToId || null,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "NURSING_TASK_CREATED", resourceType: "nursing_task", resourceId: item.id, newValues: { patientId, title, taskType, dueAt } });
  return NextResponse.json({ item }, { status: 201 });
}
