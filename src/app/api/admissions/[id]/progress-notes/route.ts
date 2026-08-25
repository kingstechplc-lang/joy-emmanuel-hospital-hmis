// =====================================================================
// API: /api/admissions/[id]/progress-notes
//   GET  — list progress notes for an admission
//   POST — create a new progress note (SOAP)
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
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_VIEW) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const notes = await db.progressNote.findMany({
    where: { admissionId: id },
    orderBy: { authoredAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ items: notes, count: notes.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.ADMISSION_PROGRESS_NOTE) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden — missing admission.progress_note permission" }, { status: 403 });
  }
  const { id } = await params;
  const admission = await db.admission.findUnique({ where: { id } });
  if (!admission) return NextResponse.json({ error: "Admission not found" }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { subjective, objective, assessment, plan, diagnosisRef, orders, followUp, noteType } = body;

  const note = await db.progressNote.create({
    data: {
      admissionId: id,
      patientId: admission.patientId,
      encounterId: admission.encounterId,
      facilityId: admission.facilityId,
      subjective: subjective || null,
      objective: objective || null,
      assessment: assessment || null,
      plan: plan || null,
      diagnosisRef: diagnosisRef || null,
      orders: orders ? (typeof orders === "string" ? orders : JSON.stringify(orders)) : null,
      followUp: followUp || null,
      noteType: noteType || "doctor",
      authoredById: session.user.id,
      authoredAt: new Date(),
      status: "final",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: admission.facilityId,
    action: "PROGRESS_NOTE_CREATED",
    resourceType: "progress_note",
    resourceId: note.id,
    newValues: { admissionId: id, noteType, diagnosisRef },
  });

  return NextResponse.json({ item: note }, { status: 201 });
}
