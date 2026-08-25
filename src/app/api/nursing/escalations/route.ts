// =====================================================================
// API: /api/nursing/escalations
//   GET  — list escalations (filter by patientId, status, priority)
//   POST — create an escalation
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
  const priority = url.searchParams.get("priority");
  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (status) where.status = status;
  if (priority) where.priority = priority;
  const items = await db.nursingEscalation.findMany({ where, orderBy: { escalatedAt: "desc" }, take: 100 });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.NURSING_ESCALATE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { patientId, admissionId, encounterId, facilityId, concern, priority, escalatedTo, escalatedToId, notes } = body;
  if (!patientId || !concern) return NextResponse.json({ error: "patientId and concern are required" }, { status: 400 });
  const item = await db.nursingEscalation.create({
    data: {
      patientId, admissionId: admissionId || null, encounterId: encounterId || null,
      facilityId: facilityId || null,
      concern, priority: priority || "routine",
      escalatedTo: escalatedTo || null, escalatedToId: escalatedToId || null,
      escalatedById: session.user.id,
      notes: notes || null,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "NURSING_ESCALATION_CREATED", resourceType: "nursing_escalation", resourceId: item.id, newValues: { patientId, concern, priority } });
  return NextResponse.json({ item }, { status: 201 });
}
