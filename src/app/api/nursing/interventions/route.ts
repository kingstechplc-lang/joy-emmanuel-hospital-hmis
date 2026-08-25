// =====================================================================
// API: /api/nursing/interventions
//   GET  — list interventions (filter by patientId, carePlanId, status)
//   POST — create a nursing intervention
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
  const carePlanId = url.searchParams.get("carePlanId");
  const status = url.searchParams.get("status");
  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (carePlanId) where.carePlanId = carePlanId;
  if (status) where.status = status;
  const items = await db.nursingIntervention.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.NURSING_INTERVENTION) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { patientId, admissionId, encounterId, facilityId, carePlanId, interventionType, description, frequency, patientResponse, responseNotes, notes } = body;
  if (!patientId || !description) return NextResponse.json({ error: "patientId and description are required" }, { status: 400 });
  const item = await db.nursingIntervention.create({
    data: {
      patientId, admissionId: admissionId || null, encounterId: encounterId || null,
      facilityId: facilityId || null,
      carePlanId: carePlanId || null,
      interventionType: interventionType || "other",
      description,
      frequency: frequency || null,
      patientResponse: patientResponse || null,
      responseNotes: responseNotes || null,
      notes: notes || null,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "NURSING_INTERVENTION_CREATED", resourceType: "nursing_intervention", resourceId: item.id, newValues: { patientId, description, interventionType } });
  return NextResponse.json({ item }, { status: 201 });
}
