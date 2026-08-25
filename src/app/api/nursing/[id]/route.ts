// =====================================================================
// API: /api/nursing/[id]
//   PATCH — update note (only if draft) or sign/amend
//   Body: { action: "edit" | "submit" | "sign" | "amend", ...fields }
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { action } = body;

  const existing = await db.nursingNote.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  // ---- EDIT (only if draft) ----
  if (action === "edit" || !action) {
    if (!session.user.permissions?.includes(PERMISSIONS.NURSING_NOTE_CREATE) && !session.user.roles.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.status !== "draft") {
      return NextResponse.json({ error: "Cannot edit a submitted/signed note. Use amend instead." }, { status: 400 });
    }
    const updateData: any = {};
    const fields = ["content", "noteType", "shift", "subjective", "objective", "assessment", "plan", "focusData", "focusAction", "focusResponse", "wardId", "bedId"];
    for (const f of fields) {
      if (body[f] !== undefined) updateData[f] = body[f] || null;
    }
    if (body.eventAt) updateData.eventAt = new Date(body.eventAt);
    const updated = await db.nursingNote.update({ where: { id }, data: updateData });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "NURSING_NOTE_EDITED", resourceType: "nursing_note", resourceId: id, newValues: updateData });
    return NextResponse.json({ item: updated });
  }

  // ---- SUBMIT (draft → submitted) ----
  if (action === "submit") {
    if (!session.user.permissions?.includes(PERMISSIONS.NURSING_NOTE_CREATE) && !session.user.roles.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const updated = await db.nursingNote.update({ where: { id }, data: { status: "submitted" } });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "NURSING_NOTE_SUBMITTED", resourceType: "nursing_note", resourceId: id });
    return NextResponse.json({ item: updated });
  }

  // ---- SIGN (submitted → signed) ----
  if (action === "sign") {
    if (!session.user.permissions?.includes(PERMISSIONS.NURSING_NOTE_SIGN) && !session.user.roles.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden — missing nursing.note.sign permission" }, { status: 403 });
    }
    if (existing.status !== "submitted" && existing.status !== "draft") {
      return NextResponse.json({ error: "Can only sign submitted or draft notes" }, { status: 400 });
    }
    const updated = await db.nursingNote.update({
      where: { id },
      data: { status: "signed", signedById: session.user.id, signedAt: new Date() },
    });
    await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "NURSING_NOTE_SIGNED", resourceType: "nursing_note", resourceId: id });
    return NextResponse.json({ item: updated });
  }

  // ---- AMEND (signed → amended, create new version) ----
  if (action === "amend") {
    if (!session.user.permissions?.includes(PERMISSIONS.NURSING_NOTE_AMEND) && !session.user.roles.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden — missing nursing.note.amend permission" }, { status: 403 });
    }
    if (existing.status !== "signed") {
      return NextResponse.json({ error: "Can only amend signed notes" }, { status: 400 });
    }
    const { reason } = body;
    if (!reason) return NextResponse.json({ error: "reason is required for amendment" }, { status: 400 });
    // Mark original as amended (preserved in history)
    await db.nursingNote.update({ where: { id }, data: { status: "amended" } });
    // Create new version with amended content
    const amended = await db.nursingNote.create({
      data: {
        patientId: existing.patientId,
        encounterId: existing.encounterId,
        admissionId: existing.admissionId,
        nurseId: session.user.id,
        noteType: existing.noteType,
        content: body.content || existing.content,
        shift: existing.shift,
        subjective: body.subjective || existing.subjective,
        objective: body.objective || existing.objective,
        assessment: body.assessment || existing.assessment,
        plan: body.plan || existing.plan,
        focusData: body.focusData || existing.focusData,
        focusAction: body.focusAction || existing.focusAction,
        focusResponse: body.focusResponse || existing.focusResponse,
        status: "signed",
        signedById: session.user.id,
        signedAt: new Date(),
        amendedFromId: existing.id,
        eventAt: existing.eventAt,
        wardId: existing.wardId,
        bedId: existing.bedId,
        facilityId: existing.facilityId,
      },
    });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId,
      action: "NURSING_NOTE_AMENDED", resourceType: "nursing_note", resourceId: amended.id,
      oldValues: { originalId: existing.id }, newValues: { amendedId: amended.id, reason },
    });
    return NextResponse.json({ item: amended }, { status: 201 });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
