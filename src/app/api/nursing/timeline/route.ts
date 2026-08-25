// =====================================================================
// API: /api/nursing/timeline
//   GET — unified chronological nursing timeline for a patient
//   Merges: nursing notes, care plans, handovers, escalations, tasks,
//   wound assessments, risk assessments, interventions, vital signs,
//   intake/output entries — sorted by date descending
//   Query: patientId (required), limit?
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.permissions?.includes(PERMISSIONS.NURSING_VIEW) && !session.user.permissions?.includes(PERMISSIONS.CLINICAL_VIEW) && !session.user.roles.includes("super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const limit = parseInt(url.searchParams.get("limit") || "200");

  if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });

  const [notes, carePlans, handovers, escalations, tasks, wounds, riskAssessments, interventions, vitals, intakeOutput] = await Promise.all([
    db.nursingNote.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, noteType: true, content: true, shift: true, status: true, subjective: true, objective: true, assessment: true, plan: true, isEscalation: true, createdAt: true, nurseId: true } }),
    db.carePlan.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, problem: true, goal: true, status: true, priority: true, createdAt: true, createdById: true } }),
    db.nursingHandover.findMany({ where: { patientId }, orderBy: { handoverDate: "desc" }, take: 50, select: { id: true, shiftType: true, currentCondition: true, status: true, handoverDate: true, fromNurseId: true } }),
    db.nursingEscalation.findMany({ where: { patientId }, orderBy: { escalatedAt: "desc" }, take: 50, select: { id: true, concern: true, priority: true, status: true, escalatedTo: true, escalatedAt: true, escalatedById: true, resolution: true } }),
    db.nursingTask.findMany({ where: { patientId }, orderBy: { dueAt: "desc" }, take: 50, select: { id: true, title: true, taskType: true, status: true, dueAt: true, completedAt: true } }),
    db.woundAssessment.findMany({ where: { patientId }, orderBy: { assessedAt: "desc" }, take: 50, select: { id: true, woundLocation: true, woundType: true, stage: true, appearance: true, assessedAt: true, assessedById: true } }),
    db.riskAssessment.findMany({ where: { patientId }, orderBy: { assessedAt: "desc" }, take: 50, select: { id: true, assessmentType: true, riskLevel: true, riskScore: true, assessedAt: true } }),
    db.nursingIntervention.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, description: true, interventionType: true, status: true, patientResponse: true, createdAt: true } }),
    db.vitalSign.findMany({ where: { patientId }, orderBy: { recordedAt: "desc" }, take: 50, select: { id: true, temperature: true, pulse: true, respiratoryRate: true, systolicBP: true, diastolicBP: true, oxygenSaturation: true, painScore: true, recordedAt: true } }),
    db.intakeOutputEntry.findMany({ where: { patientId }, orderBy: { recordedAt: "desc" }, take: 50, select: { id: true, entryType: true, fluidType: true, amount: true, recordedAt: true } }),
  ]);

  // Merge into a unified timeline
  const timeline: any[] = [];

  for (const n of notes) {
    timeline.push({ type: "nursing_note", date: n.createdAt, record: n,
      summary: n.noteType ? `${n.noteType.replace(/_/g, " ")}` : "Note",
      detail: n.subjective || n.content?.slice(0, 100) || "—",
      status: n.status, icon: "note" });
  }
  for (const cp of carePlans) {
    timeline.push({ type: "care_plan", date: cp.createdAt, record: cp,
      summary: "Care Plan", detail: cp.problem || "—", status: cp.status, icon: "clipboard" });
  }
  for (const h of handovers) {
    timeline.push({ type: "handover", date: h.handoverDate, record: h,
      summary: `Handover (${h.shiftType})`, detail: h.currentCondition || "—", status: h.status, icon: "handover" });
  }
  for (const e of escalations) {
    timeline.push({ type: "escalation", date: e.escalatedAt, record: e,
      summary: `Escalation (${e.priority})`, detail: e.concern, status: e.status, icon: "alert" });
  }
  for (const t of tasks) {
    timeline.push({ type: "task", date: t.dueAt, record: t,
      summary: `Task: ${t.title}`, detail: t.taskType, status: t.status, icon: "task" });
  }
  for (const w of wounds) {
    timeline.push({ type: "wound", date: w.assessedAt, record: w,
      summary: `Wound: ${w.woundLocation || "—"}`, detail: `${w.woundType || ""} ${w.stage || ""}`.trim(), status: null, icon: "bandage" });
  }
  for (const r of riskAssessments) {
    timeline.push({ type: "risk_assessment", date: r.assessedAt, record: r,
      summary: `Risk: ${r.assessmentType}`, detail: `${r.riskLevel || ""} ${r.riskScore != null ? `(${r.riskScore})` : ""}`.trim(), status: null, icon: "shield" });
  }
  for (const i of interventions) {
    timeline.push({ type: "intervention", date: i.createdAt, record: i,
      summary: `Intervention: ${i.interventionType || "—"}`, detail: i.description, status: i.status, icon: "intervention" });
  }
  for (const v of vitals) {
    timeline.push({ type: "vitals", date: v.recordedAt, record: v,
      summary: "Vital Signs", detail: `T:${v.temperature || "—"} P:${v.pulse || "—"} BP:${v.systolicBP || "—"}/${v.diastolicBP || "—"} SpO₂:${v.oxygenSaturation || "—"} Pain:${v.painScore ?? "—"}`, status: null, icon: "vitals" });
  }
  for (const io of intakeOutput) {
    timeline.push({ type: "intake_output", date: io.recordedAt, record: io,
      summary: `${io.entryType === "intake" ? "Intake" : "Output"}: ${io.fluidType}`, detail: `${io.amount} ml`, status: null, icon: "io" });
  }

  // Sort by date descending
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({
    timeline: timeline.slice(0, limit),
    count: timeline.length,
    counts: {
      notes: notes.length, carePlans: carePlans.length, handovers: handovers.length,
      escalations: escalations.length, tasks: tasks.length, wounds: wounds.length,
      riskAssessments: riskAssessments.length, interventions: interventions.length,
      vitals: vitals.length, intakeOutput: intakeOutput.length,
    },
  });
}
