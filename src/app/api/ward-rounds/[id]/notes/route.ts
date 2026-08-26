// =====================================================================
// API: /api/ward-rounds/[id]/notes
//   GET  — list round notes
//   POST — create a SOAP round note
//   PATCH — sign/amend note
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
  const notes = await db.wardRoundNote.findMany({
    where: { wardRoundId: id },
    include: { patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } } },
    orderBy: { authoredAt: "desc" },
  });
  return NextResponse.json({ items: notes, count: notes.length });
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
  const { patientId, wardRoundPatientId, admissionId, encounterId, subjective, objective, assessment, plan, content, overnightEvents, examinationFindings, clinicalConcerns, responseToTreatment, progressStatus, eventAt } = body;
  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  const note = await db.wardRoundNote.create({
    data: {
      wardRoundId: id, wardRoundPatientId: wardRoundPatientId || null,
      patientId, admissionId: admissionId || null, encounterId: encounterId || null,
      facilityId: round.facilityId,
      subjective: subjective || null, objective: objective || null,
      assessment: assessment || null, plan: plan || null,
      content: content || null,
      overnightEvents: overnightEvents || null,
      examinationFindings: examinationFindings || null,
      clinicalConcerns: clinicalConcerns || null,
      responseToTreatment: responseToTreatment || null,
      progressStatus: progressStatus || null,
      status: "draft",
      authoredById: session.user.id,
      eventAt: eventAt ? new Date(eventAt) : null,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId: round.facilityId, action: "WARD_ROUND_NOTE_CREATED", resourceType: "ward_round_note", resourceId: note.id, newValues: { patientId, roundId: id } });
  return NextResponse.json({ item: note }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { action, noteId, reason } = body;
  if (!noteId) return NextResponse.json({ error: "noteId is required" }, { status: 400 });
  const existing = await db.wardRoundNote.findUnique({ where: { id: noteId } });
  if (!existing || existing.wardRoundId !== id) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  if (action === "sign") {
    if (!session.user.permissions?.includes(PERMISSIONS.WARD_ROUND_SIGN) && !session.user.roles.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden — missing ward_round.sign permission" }, { status: 403 });
    }
    if (existing.status === "signed") return NextResponse.json({ error: "Note already signed" }, { status: 400 });
    const updated = await db.wardRoundNote.update({ where: { id: noteId }, data: { status: "signed", signedById: session.user.id, signedAt: new Date() } });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "WARD_ROUND_NOTE_SIGNED", resourceType: "ward_round_note", resourceId: noteId });
    return NextResponse.json({ item: updated });
  }
  if (action === "amend") {
    if (!session.user.permissions?.includes(PERMISSIONS.WARD_ROUND_AMEND) && !session.user.roles.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden — missing ward_round.amend permission" }, { status: 403 });
    }
    if (existing.status !== "signed") return NextResponse.json({ error: "Can only amend signed notes" }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "reason is required for amendment" }, { status: 400 });
    await db.wardRoundNote.update({ where: { id: noteId }, data: { status: "amended" } });
    const amended = await db.wardRoundNote.create({
      data: {
        wardRoundId: existing.wardRoundId, wardRoundPatientId: existing.wardRoundPatientId,
        patientId: existing.patientId, admissionId: existing.admissionId, encounterId: existing.encounterId,
        facilityId: existing.facilityId,
        subjective: body.subjective || existing.subjective, objective: body.objective || existing.objective,
        assessment: body.assessment || existing.assessment, plan: body.plan || existing.plan,
        content: body.content || existing.content,
        overnightEvents: body.overnightEvents || existing.overnightEvents,
        examinationFindings: body.examinationFindings || existing.examinationFindings,
        clinicalConcerns: body.clinicalConcerns || existing.clinicalConcerns,
        responseToTreatment: body.responseToTreatment || existing.responseToTreatment,
        progressStatus: body.progressStatus || existing.progressStatus,
        status: "signed", signedById: session.user.id, signedAt: new Date(),
        amendedFromId: existing.id, amendmentReason: reason,
        authoredById: session.user.id, eventAt: existing.eventAt,
      },
    });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "WARD_ROUND_NOTE_AMENDED", resourceType: "ward_round_note", resourceId: amended.id, oldValues: { originalId: existing.id }, newValues: { reason } });
    return NextResponse.json({ item: amended }, { status: 201 });
  }
  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
