// =====================================================================
// API: /api/diagnoses/seed
//   POST — seed the catalog with common ICD-10 diagnoses (idempotent).
//          Admin-only. Useful for first-time setup.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// Common ICD-10 diagnoses for a Ghanaian hospital setting
const SEED_DIAGNOSES = [
  // Cardiovascular
  { code: "I10", name: "Essential (primary) hypertension", category: "cardiovascular", synonyms: ["HTN", "High BP", "High blood pressure", "Hypertension"], isChronicDefault: true, specialty: "CARDIO" },
  { code: "I11.9", name: "Hypertensive heart disease without heart failure", category: "cardiovascular", synonyms: ["Hypertensive heart disease"], isChronicDefault: true, specialty: "CARDIO" },
  { code: "I50.9", name: "Heart failure, unspecified", category: "cardiovascular", synonyms: ["Cardiac failure", "CHF", "Congestive heart failure"], isChronicDefault: true, specialty: "CARDIO" },
  { code: "I20.9", name: "Angina pectoris, unspecified", category: "cardiovascular", synonyms: ["Angina", "Chest pain - angina"], isChronicDefault: true, specialty: "CARDIO" },
  { code: "I21.9", name: "Acute myocardial infarction, unspecified", category: "cardiovascular", synonyms: ["MI", "Heart attack", "Myocardial infarction"], isChronicDefault: false, specialty: "CARDIO" },
  { code: "I48", name: "Atrial fibrillation and flutter", category: "cardiovascular", synonyms: ["AF", "AFib", "A-fib"], isChronicDefault: true, specialty: "CARDIO" },

  // Endocrine
  { code: "E11.9", name: "Type 2 diabetes mellitus without complications", category: "endocrine", synonyms: ["T2DM", "Type 2 diabetes", "Diabetes mellitus type 2", "NIDDM"], isChronicDefault: true, specialty: "ENDO" },
  { code: "E10.9", name: "Type 1 diabetes mellitus without complications", category: "endocrine", synonyms: ["T1DM", "Type 1 diabetes", "IDDM"], isChronicDefault: true, specialty: "ENDO" },
  { code: "E11.65", name: "Type 2 diabetes mellitus with hyperglycemia", category: "endocrine", synonyms: ["Diabetic hyperglycemia"], isChronicDefault: true, specialty: "ENDO" },
  { code: "E03.9", name: "Hypothyroidism, unspecified", category: "endocrine", synonyms: ["Underactive thyroid", "Low thyroid"], isChronicDefault: true, specialty: "ENDO" },
  { code: "E05.9", name: "Thyrotoxicosis, unspecified", category: "endocrine", synonyms: ["Hyperthyroidism", "Overactive thyroid"], isChronicDefault: true, specialty: "ENDO" },

  // Respiratory
  { code: "J00", name: "Acute nasopharyngitis [common cold]", category: "respiratory", synonyms: ["Common cold", "Coryza", "URTI"], isChronicDefault: false, specialty: null },
  { code: "J06.9", name: "Acute upper respiratory infection, unspecified", category: "respiratory", synonyms: ["URTI", "Upper respiratory infection"], isChronicDefault: false, specialty: null },
  { code: "J20.9", name: "Acute bronchitis, unspecified", category: "respiratory", synonyms: ["Bronchitis", "Chest cold"], isChronicDefault: false, specialty: null },
  { code: "J45.9", name: "Asthma, unspecified", category: "respiratory", synonyms: ["Asthma"], isChronicDefault: true, specialty: null },
  { code: "J44.9", name: "Chronic obstructive pulmonary disease, unspecified", category: "respiratory", synonyms: ["COPD", "COAD"], isChronicDefault: true, specialty: null },
  { code: "J18.9", name: "Pneumonia, unspecified organism", category: "respiratory", synonyms: ["Pneumonia", "Chest infection"], isChronicDefault: false, specialty: null },
  { code: "J11.1", name: "Influenza with pneumonia, influenza virus identified", category: "respiratory", synonyms: ["Flu with pneumonia"], isChronicDefault: false, specialty: null },
  { code: "J11.8", name: "Influenza with other manifestations, virus identified", category: "respiratory", synonyms: ["Flu", "Influenza"], isChronicDefault: false, specialty: null },

  // Infectious diseases
  { code: "A00.9", name: "Cholera, unspecified", category: "infectious", synonyms: ["Cholera"], isChronicDefault: false, specialty: null },
  { code: "A09", name: "Diarrhoea and gastroenteritis of presumed infectious origin", category: "infectious", synonyms: ["Diarrhea", "Gastroenteritis", "Stomach bug", "Food poisoning"], isChronicDefault: false, specialty: null },
  { code: "B54", name: "Unspecified malaria", category: "infectious", synonyms: ["Malaria", "Malaria fever"], isChronicDefault: false, specialty: null },
  { code: "B50.0", name: "Plasmodium falciparum malaria with cerebral complications", category: "infectious", synonyms: ["Cerebral malaria", "Severe malaria"], isChronicDefault: false, specialty: null },
  { code: "A15.0", name: "Tuberculosis of lung, confirmed by sputum microscopy", category: "infectious", synonyms: ["TB", "Pulmonary TB", "Tuberculosis"], isChronicDefault: true, specialty: null },
  { code: "A41.9", name: "Sepsis, unspecified organism", category: "infectious", synonyms: ["Sepsis", "Septicemia"], isChronicDefault: false, specialty: null },

  // Gastrointestinal
  { code: "K29.7", name: "Gastritis, unspecified", category: "gastrointestinal", synonyms: ["Gastritis", "Stomach inflammation"], isChronicDefault: false, specialty: null },
  { code: "K21.9", name: "Gastro-oesophageal reflux disease without oesophagitis", category: "gastrointestinal", synonyms: ["GORD", "GERD", "Acid reflux", "Heartburn"], isChronicDefault: true, specialty: null },
  { code: "K35.9", name: "Acute appendicitis, unspecified", category: "gastrointestinal", synonyms: ["Appendicitis"], isChronicDefault: false, specialty: null },
  { code: "K59.0", name: "Constipation", category: "gastrointestinal", synonyms: ["Constipation"], isChronicDefault: false, specialty: null },
  { code: "K92.2", name: "Gastrointestinal haemorrhage, unspecified", category: "gastrointestinal", synonyms: ["GI bleed", "GI hemorrhage"], isChronicDefault: false, specialty: null },

  // Musculoskeletal
  { code: "M19.9", name: "Osteoarthritis, unspecified site", category: "musculoskeletal", synonyms: ["OA", "Osteoarthritis", "Degenerative joint disease"], isChronicDefault: true, specialty: "ORTHO" },
  { code: "M06.9", name: "Rheumatoid arthritis, unspecified", category: "musculoskeletal", synonyms: ["RA", "Rheumatoid arthritis"], isChronicDefault: true, specialty: "ORTHO" },
  { code: "M54.5", name: "Low back pain", category: "musculoskeletal", synonyms: ["Lumbago", "Back pain", "Lower back pain"], isChronicDefault: false, specialty: "ORTHO" },
  { code: "M25.5", name: "Pain in joint", category: "musculoskeletal", synonyms: ["Joint pain", "Arthralgia"], isChronicDefault: false, specialty: "ORTHO" },

  // Neurological
  { code: "G40.9", name: "Epilepsy, unspecified", category: "neurological", synonyms: ["Epilepsy", "Seizures", "Seizure disorder"], isChronicDefault: true, specialty: "NEURO" },
  { code: "G43.9", name: "Migraine, unspecified", category: "neurological", synonyms: ["Migraine", "Headache - migraine"], isChronicDefault: true, specialty: "NEURO" },
  { code: "I63.9", name: "Cerebral infarction, unspecified", category: "neurological", synonyms: ["Stroke", "CVA", "Cerebrovascular accident"], isChronicDefault: true, specialty: "NEURO" },
  { code: "R51", name: "Headache", category: "neurological", synonyms: ["Headache", "Cephalalgia"], isChronicDefault: false, specialty: null },

  // Mental health
  { code: "F32.9", name: "Depressive episode, unspecified", category: "mental_health", synonyms: ["Depression", "Depressive disorder"], isChronicDefault: true, specialty: "PSYCH" },
  { code: "F41.1", name: "Generalized anxiety disorder", category: "mental_health", synonyms: ["GAD", "Anxiety", "Anxiety disorder"], isChronicDefault: true, specialty: "PSYCH" },
  { code: "F41.9", name: "Anxiety disorder, unspecified", category: "mental_health", synonyms: ["Anxiety - unspecified"], isChronicDefault: false, specialty: "PSYCH" },

  // Skin
  { code: "L20.9", name: "Atopic dermatitis, unspecified", category: "dermatological", synonyms: ["Eczema", "Atopic eczema"], isChronicDefault: true, specialty: "DERM" },
  { code: "L70.0", name: "Acne vulgaris", category: "dermatological", synonyms: ["Acne", "Pimples"], isChronicDefault: false, specialty: "DERM" },
  { code: "L40.9", name: "Psoriasis, unspecified", category: "dermatological", synonyms: ["Psoriasis"], isChronicDefault: true, specialty: "DERM" },

  // Genitourinary
  { code: "N39.0", name: "Urinary tract infection, site not specified", category: "genitourinary", synonyms: ["UTI", "Urinary infection", "Bladder infection"], isChronicDefault: false, specialty: "URO" },
  { code: "N18.9", name: "Chronic kidney disease, unspecified", category: "genitourinary", synonyms: ["CKD", "Chronic renal failure", "CRF"], isChronicDefault: true, specialty: "URO" },

  // Eye / ENT / Dental
  { code: "H10.9", name: "Conjunctivitis, unspecified", category: "eye", synonyms: ["Pink eye", "Apollo", "Conjunctivitis"], isChronicDefault: false, specialty: "OPHTH" },
  { code: "H52.4", name: "Presbyopia", category: "eye", synonyms: ["Long sight", "Reading glasses"], isChronicDefault: true, specialty: "OPHTH" },
  { code: "J01.9", name: "Acute sinusitis, unspecified", category: "ent", synonyms: ["Sinusitis"], isChronicDefault: false, specialty: "ENT" },
  { code: "J02.9", name: "Acute pharyngitis, unspecified", category: "ent", synonyms: ["Sore throat", "Pharyngitis"], isChronicDefault: false, specialty: "ENT" },
  { code: "K02.9", name: "Dental caries, unspecified", category: "dental", synonyms: ["Tooth decay", "Cavity", "Caries"], isChronicDefault: false, specialty: "DENTAL" },

  // Maternal
  { code: "O13", name: "Gestational [pregnancy-induced] hypertension without significant proteinuria", category: "obstetric", synonyms: ["PIH", "Gestational hypertension", "Pregnancy-induced hypertension"], isChronicDefault: false, specialty: null },
  { code: "O14.9", name: "Pre-eclampsia, unspecified", category: "obstetric", synonyms: ["Preeclampsia", "Pre-eclampsia", "Toxemia of pregnancy"], isChronicDefault: false, specialty: null },

  // Paediatric
  { code: "A90", name: "Dengue fever [classical dengue]", category: "infectious", synonyms: ["Dengue", "Breakbone fever"], isChronicDefault: false, specialty: null },
  { code: "B05.9", name: "Measles without complication", category: "infectious", synonyms: ["Measles", "Rubeola"], isChronicDefault: false, specialty: "PAED" },

  // General / symptoms
  { code: "R50.9", name: "Fever, unspecified", category: "symptoms", synonyms: ["Fever", "Pyrexia", "Fever of unknown origin", "FUO"], isChronicDefault: false, specialty: null },
  { code: "R05.9", name: "Cough", category: "symptoms", synonyms: ["Cough"], isChronicDefault: false, specialty: null },
  { code: "R10.4", name: "Other and unspecified abdominal pain", category: "symptoms", synonyms: ["Abdominal pain", "Stomach pain", "Belly pain", "Tummy ache"], isChronicDefault: false, specialty: null },
  { code: "R42", name: "Dizziness and giddiness", category: "symptoms", synonyms: ["Dizziness", "Giddiness", "Vertigo"], isChronicDefault: false, specialty: null },
  { code: "R53", name: "Malaise and fatigue", category: "symptoms", synonyms: ["Fatigue", "Tiredness", "Weakness", "Malaise"], isChronicDefault: false, specialty: null },
];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DIAGNOSIS_CATALOG_MANAGE)) {
    return NextResponse.json({ error: "Forbidden — diagnosis.catalog.manage required" }, { status: 403 });
  }

  let created = 0;
  let skipped = 0;

  for (const d of SEED_DIAGNOSES) {
    const existing = await db.diagnosisCatalog.findUnique({
      where: {
        organizationId_code_codeSystem: {
          organizationId: session.user.organizationId,
          code: d.code,
          codeSystem: "ICD-10",
        },
      },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await db.diagnosisCatalog.create({
      data: {
        organizationId: session.user.organizationId,
        code: d.code,
        codeSystem: "ICD-10",
        name: d.name,
        category: d.category,
        synonyms: JSON.stringify(d.synonyms),
        isChronicDefault: d.isChronicDefault,
        specialty: d.specialty,
        version: "ICD-10-2023",
        source: "WHO ICD-10",
        isActive: true,
      },
    });
    created++;
  }

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "DIAGNOSIS_CATALOG_SEEDED",
    resourceType: "diagnosisCatalog",
    newValues: { created, skipped, total: SEED_DIAGNOSES.length },
  });

  return NextResponse.json({ ok: true, created, skipped, total: SEED_DIAGNOSES.length });
}
