// =====================================================================
// API: /api/seed-training-defaults — POST
//   Seeds default training programs, competencies.
//   Idempotent — skips existing entries.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const DEFAULT_PROGRAMS = [
  { title: "Basic Life Support (BLS)", code: "BLS", category: "Clinical", trainingType: "certification", deliveryMethod: "in_person", isMandatory: true, durationHours: 8, cpdPoints: 8, validityMonths: 24, renewalMonths: 3, assessmentRequired: true, passingScore: 70, certificateRequired: true },
  { title: "Advanced Cardiac Life Support (ACLS)", code: "ACLS", category: "Clinical", trainingType: "certification", deliveryMethod: "in_person", isMandatory: false, durationHours: 16, cpdPoints: 16, validityMonths: 24, renewalMonths: 3, assessmentRequired: true, passingScore: 70, certificateRequired: true },
  { title: "Infection Prevention & Control (IPC)", code: "IPC", category: "Infection Control", trainingType: "refresher", deliveryMethod: "in_person", isMandatory: true, durationHours: 4, cpdPoints: 4, validityMonths: 12, renewalMonths: 2, assessmentRequired: true, passingScore: 70, certificateRequired: true },
  { title: "Fire Safety", code: "FIRE-SAFETY", category: "Occupational Safety", trainingType: "orientation", deliveryMethod: "in_person", isMandatory: true, durationHours: 2, cpdPoints: 2, validityMonths: 12, renewalMonths: 2, assessmentRequired: false, certificateRequired: true },
  { title: "Occupational Health & Safety", code: "OHS", category: "Occupational Safety", trainingType: "orientation", deliveryMethod: "in_person", isMandatory: true, durationHours: 3, cpdPoints: 3, validityMonths: 12, renewalMonths: 2, assessmentRequired: false, certificateRequired: true },
  { title: "Patient Safety", code: "PATIENT-SAFETY", category: "Patient Safety", trainingType: "orientation", deliveryMethod: "in_person", isMandatory: true, durationHours: 3, cpdPoints: 3, validityMonths: 12, renewalMonths: 2, assessmentRequired: true, passingScore: 70, certificateRequired: true },
  { title: "Emergency Response", code: "EMERGENCY-RESP", category: "Emergency", trainingType: "skills", deliveryMethod: "simulation", isMandatory: true, durationHours: 6, cpdPoints: 6, validityMonths: 12, renewalMonths: 2, assessmentRequired: true, passingScore: 70, certificateRequired: true },
  { title: "First Aid", code: "FIRST-AID", category: "Clinical", trainingType: "certification", deliveryMethod: "in_person", isMandatory: false, durationHours: 8, cpdPoints: 8, validityMonths: 36, renewalMonths: 3, assessmentRequired: true, passingScore: 70, certificateRequired: true },
  { title: "Cybersecurity Awareness", code: "CYBER-AWARE", category: "IT", trainingType: "e_learning", deliveryMethod: "online", isMandatory: true, durationHours: 1, cpdPoints: 1, validityMonths: 12, renewalMonths: 1, assessmentRequired: true, passingScore: 70, certificateRequired: false },
  { title: "Data Protection & Privacy", code: "DATA-PRIVACY", category: "Compliance", trainingType: "e_learning", deliveryMethod: "online", isMandatory: true, durationHours: 1, cpdPoints: 1, validityMonths: 12, renewalMonths: 1, assessmentRequired: true, passingScore: 70, certificateRequired: false },
  { title: "Medication Safety", code: "MED-SAFETY", category: "Pharmacy", trainingType: "clinical", deliveryMethod: "in_person", isMandatory: false, durationHours: 4, cpdPoints: 4, validityMonths: 24, renewalMonths: 3, assessmentRequired: true, passingScore: 70, certificateRequired: true },
  { title: "Blood Transfusion Safety", code: "BLOOD-SAFETY", category: "Clinical", trainingType: "clinical", deliveryMethod: "in_person", isMandatory: false, durationHours: 3, cpdPoints: 3, validityMonths: 24, renewalMonths: 3, assessmentRequired: true, passingScore: 70, certificateRequired: true },
  { title: "Clinical Documentation", code: "CLIN-DOC", category: "Clinical", trainingType: "orientation", deliveryMethod: "in_person", isMandatory: true, durationHours: 2, cpdPoints: 2, validityMonths: 12, renewalMonths: 1, assessmentRequired: false, certificateRequired: false },
  { title: "Medical Ethics", code: "MED-ETHICS", category: "Compliance", trainingType: "seminar", deliveryMethod: "in_person", isMandatory: true, durationHours: 3, cpdPoints: 3, validityMonths: 36, renewalMonths: 3, assessmentRequired: false, certificateRequired: true },
  { title: "Laboratory Safety", code: "LAB-SAFETY", category: "Laboratory", trainingType: "orientation", deliveryMethod: "in_person", isMandatory: false, durationHours: 4, cpdPoints: 4, validityMonths: 12, renewalMonths: 2, assessmentRequired: true, passingScore: 70, certificateRequired: true },
  { title: "Hospital Orientation", code: "ORIENTATION", category: "Orientation", trainingType: "orientation", deliveryMethod: "in_person", isMandatory: true, durationHours: 8, cpdPoints: 0, validityMonths: null, renewalMonths: null, assessmentRequired: false, certificateRequired: false },
];

const DEFAULT_COMPETENCIES = [
  { name: "Basic Life Support", category: "Clinical", description: "Ability to perform CPR and use AED" },
  { name: "Infection Prevention", category: "Infection Control", description: "Knowledge of IPC protocols and hand hygiene" },
  { name: "Emergency Response", category: "Emergency", description: "Ability to respond to medical emergencies" },
  { name: "Medation Administration", category: "Pharmacy", description: "Safe medication administration practices" },
  { name: "Patient Assessment", category: "Clinical", description: "Clinical patient assessment skills" },
  { name: "Wound Care", category: "Nursing", description: "Wound dressing and care competency" },
  { name: "IV Cannulation", category: "Clinical", description: "Intravenous cannulation skills" },
  { name: "Phlebotomy", category: "Laboratory", description: "Blood sample collection" },
  { name: "Fire Safety Response", category: "Occupational Safety", description: "Fire emergency response and extinguisher use" },
  { name: "Data Privacy Compliance", category: "Compliance", description: "Patient data protection practices" },
];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.TRAINING_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.organizationId;
  let body: any = {};
  try { body = JSON.parse(await req.text() || "{}"); } catch {}
  const facilityId = body.facilityId || null;

  const results = {
    programsCreated: 0,
    programsSkipped: 0,
    competenciesCreated: 0,
    competenciesSkipped: 0,
  };

  // ---- PROGRAMS ----
  for (const p of DEFAULT_PROGRAMS) {
    const existing = await db.trainingProgram.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: p.code } },
    });
    if (existing) {
      results.programsSkipped++;
      continue;
    }
    await db.trainingProgram.create({
      data: {
        organizationId: orgId,
        facilityId,
        title: p.title,
        code: p.code,
        category: p.category,
        trainingType: p.trainingType,
        deliveryMethod: p.deliveryMethod,
        isMandatory: p.isMandatory,
        durationHours: p.durationHours,
        cpdPoints: p.cpdPoints,
        validityMonths: p.validityMonths,
        renewalMonths: p.renewalMonths,
        assessmentRequired: p.assessmentRequired,
        passingScore: p.passingScore || null,
        certificateRequired: p.certificateRequired,
        status: "active",
      },
    });
    results.programsCreated++;
  }

  // ---- COMPETENCIES ----
  for (const c of DEFAULT_COMPETENCIES) {
    const existing = await db.trainingCompetency.findUnique({
      where: { organizationId_name: { organizationId: orgId, name: c.name } },
    });
    if (existing) {
      results.competenciesSkipped++;
      continue;
    }
    await db.trainingCompetency.create({
      data: {
        organizationId: orgId,
        name: c.name,
        category: c.category,
        description: c.description,
      },
    });
    results.competenciesCreated++;
  }

  await auditLog({
    userId: session.user.id,
    organizationId: orgId,
    action: "TRAINING_DEFAULTS_SEEDED",
    resourceType: "organization",
    resourceId: orgId,
    newValues: results,
  });

  return NextResponse.json({ ok: true, results });
}
