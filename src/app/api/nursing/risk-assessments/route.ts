// =====================================================================
// API: /api/nursing/risk-assessments
//   GET  — list risk assessments (filter by patientId, assessmentType)
//   POST — create a risk assessment
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
  const assessmentType = url.searchParams.get("assessmentType");
  const where: any = {};
  if (patientId) where.patientId = patientId;
  if (assessmentType) where.assessmentType = assessmentType;
  const items = await db.riskAssessment.findMany({ where, orderBy: { assessedAt: "desc" }, take: 100 });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.NURSING_RISK_ASSESSMENT) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { patientId, admissionId, encounterId, facilityId, assessmentType, riskLevel, riskScore, riskFactors, preventionPlan, interventions, reviewDate, notes } = body;
  if (!patientId || !assessmentType) return NextResponse.json({ error: "patientId and assessmentType are required" }, { status: 400 });
  const item = await db.riskAssessment.create({
    data: {
      patientId, admissionId: admissionId || null, encounterId: encounterId || null,
      facilityId: facilityId || null,
      assessmentType,
      riskLevel: riskLevel || null,
      riskScore: typeof riskScore === "number" ? riskScore : null,
      riskFactors: riskFactors || null,
      preventionPlan: preventionPlan || null,
      interventions: interventions || null,
      reviewDate: reviewDate ? new Date(reviewDate) : null,
      assessedById: session.user.id,
      notes: notes || null,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "RISK_ASSESSMENT_CREATED", resourceType: "risk_assessment", resourceId: item.id, newValues: { patientId, assessmentType, riskLevel, riskScore } });
  return NextResponse.json({ item }, { status: 201 });
}
