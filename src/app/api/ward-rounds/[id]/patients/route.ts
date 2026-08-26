// =====================================================================
// API: /api/ward-rounds/[id]/patients
//   GET  — list patients in a round
//   POST — add patient to round
//   PATCH — update patient review status (action: "review" | "not_reviewed")
//   Body for POST: { patientId, admissionId?, reviewPriority? }
//   Body for PATCH: { wardRoundPatientId, action, notReviewedReason?, progressStatus? }
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
  const patients = await db.wardRoundPatient.findMany({
    where: { wardRoundId: id },
    include: { patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true, bloodGroup: true } } },
    orderBy: [{ reviewPriority: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ items: patients, count: patients.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.WARD_ROUND_DOCUMENT) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const round = await db.wardRound.findUnique({ where: { id } });
  if (!round) return NextResponse.json({ error: "Ward round not found" }, { status: 404 });
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { patientId, admissionId, encounterId, wardId, bedId, reviewPriority } = body;
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  // Check if patient already in this round
  const existing = await db.wardRoundPatient.findFirst({ where: { wardRoundId: id, patientId } });
  if (existing) return NextResponse.json({ error: "Patient already in this round" }, { status: 409 });
  const item = await db.wardRoundPatient.create({
    data: {
      wardRoundId: id, patientId,
      admissionId: admissionId || null, encounterId: encounterId || null,
      facilityId: round.facilityId, wardId: wardId || round.wardId || null, bedId: bedId || null,
      reviewPriority: reviewPriority || "routine",
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: round.facilityId, action: "WARD_ROUND_PATIENT_ADDED", resourceType: "ward_round", resourceId: id, newValues: { patientId } });
  return NextResponse.json({ item }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.WARD_ROUND_DOCUMENT) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { wardRoundPatientId, action, notReviewedReason, progressStatus, reviewPriority } = body;
  if (!wardRoundPatientId) return NextResponse.json({ error: "wardRoundPatientId is required" }, { status: 400 });

  if (action === "review") {
    const updated = await db.wardRoundPatient.update({
      where: { id: wardRoundPatientId, wardRoundId: id },
      data: { reviewStatus: "reviewed", reviewedAt: new Date(), reviewedById: session.user.id, progressStatus: progressStatus || null },
    });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "WARD_ROUND_PATIENT_REVIEWED", resourceType: "ward_round_patient", resourceId: wardRoundPatientId });
    return NextResponse.json({ item: updated });
  }
  if (action === "not_reviewed") {
    const updated = await db.wardRoundPatient.update({
      where: { id: wardRoundPatientId, wardRoundId: id },
      data: { reviewStatus: "not_available", notReviewedReason: notReviewedReason || "Not available" },
    });
    return NextResponse.json({ item: updated });
  }
  if (action === "update_priority") {
    const updated = await db.wardRoundPatient.update({
      where: { id: wardRoundPatientId, wardRoundId: id },
      data: { reviewPriority: reviewPriority || "routine" },
    });
    return NextResponse.json({ item: updated });
  }
  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
