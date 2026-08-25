// =====================================================================
// API: /api/nursing/wounds
//   GET  — list wound assessments (filter by patientId, admissionId)
//   POST — create a wound assessment
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
  const admissionId = url.searchParams.get("admissionId");
  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (admissionId) where.admissionId = admissionId;
  const items = await db.woundAssessment.findMany({ where, orderBy: { assessedAt: "desc" }, take: 100 });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.NURSING_WOUND_CARE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { patientId, admissionId, encounterId, facilityId, woundLocation, woundType, length, width, depth, stage, appearance, exudateType, exudateAmount, surroundingSkin, odor, painScore, dressingType, treatmentGiven, nextDressingChange, patientResponse, notes, photoUrl } = body;
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  const item = await db.woundAssessment.create({
    data: {
      patientId, admissionId: admissionId || null, encounterId: encounterId || null,
      facilityId: facilityId || null,
      woundLocation: woundLocation || null, woundType: woundType || null,
      length: typeof length === "number" ? length : null,
      width: typeof width === "number" ? width : null,
      depth: typeof depth === "number" ? depth : null,
      stage: stage || null, appearance: appearance || null,
      exudateType: exudateType || null, exudateAmount: exudateAmount || null,
      surroundingSkin: surroundingSkin || null, odor: odor || null,
      painScore: typeof painScore === "number" ? painScore : null,
      dressingType: dressingType || null, treatmentGiven: treatmentGiven || null,
      nextDressingChange: nextDressingChange ? new Date(nextDressingChange) : null,
      assessedById: session.user.id,
      patientResponse: patientResponse || null,
      notes: notes || null,
      photoUrl: photoUrl || null,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "WOUND_ASSESSMENT_CREATED", resourceType: "wound_assessment", resourceId: item.id, newValues: { patientId, woundLocation, woundType, stage } });
  return NextResponse.json({ item }, { status: 201 });
}
