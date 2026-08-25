// =====================================================================
// API: /api/nursing/handovers
//   GET  — list handovers (filter by patientId, shiftType, status)
//   POST — create a nursing handover
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
  const shiftType = url.searchParams.get("shiftType");
  const status = url.searchParams.get("status") || "active";
  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (shiftType) where.shiftType = shiftType;
  if (status !== "all") where.status = status;
  const items = await db.nursingHandover.findMany({ where, orderBy: { handoverDate: "desc" }, take: 100 });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.NURSING_HANDOVER) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { patientId, admissionId, encounterId, facilityId, wardId, shiftType, currentCondition, background, assessment, recommendation, medicationsDue, pendingTasks, safetyConcerns, allergies, recentVitals, pendingInvestigations, fromNurseId, toNurseId, notes } = body;
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  const item = await db.nursingHandover.create({
    data: {
      patientId, admissionId: admissionId || null, encounterId: encounterId || null,
      facilityId: facilityId || null, wardId: wardId || null,
      shiftType: shiftType || "morning",
      currentCondition: currentCondition || null, background: background || null,
      assessment: assessment || null, recommendation: recommendation || null,
      medicationsDue: medicationsDue || null, pendingTasks: pendingTasks || null,
      safetyConcerns: safetyConcerns || null, allergies: allergies || null,
      recentVitals: recentVitals || null, pendingInvestigations: pendingInvestigations || null,
      fromNurseId: fromNurseId || session.user.id, toNurseId: toNurseId || null,
      notes: notes || null,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "NURSING_HANDOVER_CREATED", resourceType: "nursing_handover", resourceId: item.id, newValues: { patientId, shiftType } });
  return NextResponse.json({ item }, { status: 201 });
}
