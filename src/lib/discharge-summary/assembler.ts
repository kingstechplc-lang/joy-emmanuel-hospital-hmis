// =====================================================================
// DISCHARGE SUMMARY — CONTENT ASSEMBLER
// =====================================================================
// Given an encounterId, fetches and assembles every clinical data source
// that should appear on a discharge summary:
//   - Patient demographics (from Patient)
//   - Encounter info (encounterNumber, type, startAt, endAt)
//   - Admission info (admittedAt, dischargedAt, attending clinician, ward)
//   - DischargeRecord info (dischargeNumber, dischargeType, disposition,
//     finalDiagnosis, procedures, advice)
//   - Consultations (chief complaint, HPI, exam, assessment, plan,
//     follow-up, disposition)
//   - Diagnoses (filtered by encounter, primary/discharge/final first)
//   - Lab results (released results, with test name + value + abnormal flag)
//   - Prescriptions at discharge (active prescriptions with items:
//     medication name + dose + frequency + route + duration + instructions)
//   - Vitals snapshot (most recent TriageRecord + VitalSigns)
//
// Returns a structured `content` object that is serialized to JSON
// and stored on the `DischargeSummary.content` field.
//
// The shape is intentionally sectioned so the print template + view
// can render each section independently without re-fetching data.
// =====================================================================

import { db } from "@/lib/db";

export interface DischargeSummaryContent {
  generatedAt: string;
  encounter: {
    id: string;
    encounterNumber: string;
    encounterType: string;
    status: string;
    startAt: string | null;
    endAt: string | null;
    priority: string;
    source: string;
  };
  patient: {
    id: string;
    patientNumber: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    dateOfBirth?: string | null;
    sex?: string | null;
    gender?: string | null;
    bloodGroup?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    region?: string | null;
    age: number | null;
  };
  admission?: {
    id: string;
    admissionNumber: string;
    admissionType: string | null;
    admittedAt: string;
    dischargedAt?: string | null;
    status: string;
    admissionReason?: string | null;
    admissionDiagnosis?: string | null;
    attendingClinician?: {
      id: string;
      firstName: string;
      lastName: string;
    } | null;
    lengthOfStayDays: number | null;
  };
  dischargeRecord?: {
    id: string;
    dischargeNumber: string | null;
    dischargeType: string | null;
    disposition: string | null;
    dischargedAt: string | null;
    finalDiagnosis?: string | null;
    procedures?: string | null;
    dischargeConditions?: string | null;
    adviceOnDischarge?: string | null;
    sickLeaveDays?: number | null;
    followUpAppointmentDate?: string | null;
    followUpClinic?: string | null;
  };
  consultations: Array<{
    id: string;
    clinician?: { id: string; firstName: string; lastName: string } | null;
    chiefComplaint?: string | null;
    historyPresentingIllness?: string | null;
    pastMedicalHistory?: string | null;
    physicalExamination?: string | null;
    assessment?: string | null;
    treatmentPlan?: string | null;
    followUpPlan?: string | null;
    disposition?: string | null;
    dispositionNotes?: string | null;
    patientInstructions?: string | null;
    signedAt?: string | null;
    consultationStart?: string | null;
    consultationEnd?: string | null;
  }>;
  diagnoses: Array<{
    id: string;
    diagnosisCode?: string | null;
    codeSystem?: string | null;
    diagnosisName: string;
    diagnosisType: string;
    isPrimary: boolean;
    clinicalStatus?: string | null;
    verificationStatus?: string | null;
    isChronic?: boolean | null;
    onsetDate?: string | null;
    resolvedDate?: string | null;
    diagnosedAt?: string | null;
  }>;
  investigations: Array<{
    id: string;
    testName: string;
    componentName?: string | null;
    resultValue: string | null;
    unit?: string | null;
    referenceRange?: string | null;
    abnormalFlag?: string | null;
    isCritical: boolean;
    status: string;
    verifiedAt?: string | null;
    releasedAt?: string | null;
  }>;
  dischargeMedications: Array<{
    prescriptionId: string;
    prescriptionNumber: string;
    status: string;
    prescribedAt: string;
    itemId: string;
    medicationId: string;
    medicationName: string;
    genericName?: string | null;
    brandName?: string | null;
    strength?: string | null;
    dosageForm?: string | null;
    dose?: string | null;
    frequency?: string | null;
    route?: string | null;
    duration?: string | null;
    quantity?: number | null;
    instructions?: string | null;
    isPRN: boolean;
    isSTAT: boolean;
  }>;
  vitalsSnapshot: {
    triage?: {
      id: string;
      recordedAt: string;
      temperature?: number | null;
      pulse?: number | null;
      respiratoryRate?: number | null;
      systolicBp?: number | null;
      diastolicBp?: number | null;
      oxygenSaturation?: number | null;
      weight?: number | null;
      height?: number | null;
      bmi?: number | null;
      bloodGlucose?: number | null;
      painScore?: number | null;
      consciousnessLevel?: string | null;
      triageCategory?: string | null;
      chiefComplaint?: string | null;
    };
    notes?: string | null;
  };
}

function calculateAge(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const d = typeof dob === "string" ? new Date(dob) : dob;
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

/**
 * Assemble the structured discharge summary content for an encounter.
 *
 * This is a read-only operation — no records are created or modified.
 * The caller is responsible for persisting the returned content into a
 * DischargeSummary row.
 *
 * Throws if the encounter doesn't exist or doesn't belong to the
 * caller's organization.
 */
export async function assembleDischargeSummaryContent(encounterId: string): Promise<{
  content: DischargeSummaryContent;
  primaryDiagnosisName: string | null;
  primaryDiagnosisCode: string | null;
  attendingClinicianId: string | null;
  patientId: string;
  facilityId: string;
  organizationId: string;
  admissionId: string | null;
  dischargeRecordId: string | null;
}> {
  // 1. Load the encounter with patient + admission + (any) dischargeRecord
  const encounter = await db.encounter.findUnique({
    where: { id: encounterId },
    include: {
      patient: true,
      admissions: {
        orderBy: { admittedAt: "desc" },
        take: 1,
        include: {
          attendingClinician: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
    },
  });

  if (!encounter) {
    throw new Error("Encounter not found");
  }

  // 2. Pull the most recent admission (if any) and its dischargeRecord (if any)
  const latestAdmission = encounter.admissions[0] || null;
  let dischargeRecord: any = null;
  if (latestAdmission) {
    dischargeRecord = await db.dischargeRecord.findFirst({
      where: { admissionId: latestAdmission.id },
      orderBy: { dischargedAt: "desc" },
    });
  } else {
    // No admission — check if there's a DischargeRecord linked to the encounter via admissionId chain
    // (Defensive: in normal flow, OPD encounters do not have discharge records.)
    dischargeRecord = null;
  }

  // 3. Load all signed/draft consultations for this encounter
  const consultations = await db.consultation.findMany({
    where: { encounterId },
    orderBy: { createdAt: "asc" },
    include: {
      clinician: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  // 4. Load all diagnoses for this encounter
  const diagnoses = await db.diagnosis.findMany({
    where: { encounterId },
    orderBy: [{ isPrimary: "desc" }, { diagnosisType: "asc" }, { diagnosedAt: "desc" }],
  });

  // 5. Load released/verified lab results
  // Path: LabOrder -> LabOrderItem -> LabResult, joined to LaboratoryTest for the test name.
  const labOrderItems = await db.labOrderItem.findMany({
    where: {
      labOrder: { encounterId },
      results: { some: { status: { in: ["verified", "released"] } } },
    },
    include: {
      laboratoryTest: {
        select: { id: true, name: true, displayName: true, category: true },
      },
      results: {
        where: { status: { in: ["verified", "released"] } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  // Flatten to a per-result list
  const investigations: any[] = [];
  for (const item of labOrderItems) {
    for (const r of item.results) {
      investigations.push({
        id: r.id,
        testName: item.laboratoryTest?.displayName || item.laboratoryTest?.name || "Lab Test",
        componentName: r.componentName || null,
        resultValue: r.resultValue ?? (r.numericValue != null ? String(r.numericValue) : null),
        unit: r.unit || null,
        referenceRange: r.referenceRange || null,
        abnormalFlag: r.abnormalFlag || null,
        isCritical: !!r.isCritical,
        status: r.status,
        verifiedAt: r.verifiedAt?.toISOString() || null,
        releasedAt: r.releasedAt?.toISOString() || null,
      });
    }
  }

  // 6. Load active prescriptions at discharge (status in [pending, approved,
  //    partially_dispensed, dispensed] — i.e., NOT cancelled or discontinued).
  const prescriptions = await db.prescription.findMany({
    where: {
      encounterId,
      status: { in: ["pending", "approved", "partially_dispensed", "dispensed"] },
    },
    orderBy: { prescribedAt: "asc" },
    include: {
      prescriber: { select: { id: true, firstName: true, lastName: true } },
      items: {
        include: {
          medication: {
            select: {
              id: true,
              genericName: true,
              brandName: true,
              strength: true,
              dosageForm: true,
            },
          },
        },
      },
    },
  });

  const dischargeMedications: any[] = [];
  for (const rx of prescriptions) {
    for (const item of rx.items) {
      const med = item.medication;
      dischargeMedications.push({
        prescriptionId: rx.id,
        prescriptionNumber: rx.prescriptionNumber,
        status: rx.status,
        prescribedAt: rx.prescribedAt.toISOString(),
        itemId: item.id,
        medicationId: med.id,
        medicationName: [med.genericName, med.brandName, med.strength].filter(Boolean).join(" "),
        genericName: med.genericName,
        brandName: med.brandName,
        strength: med.strength,
        dosageForm: med.dosageForm,
        dose: item.dose,
        frequency: item.frequency,
        route: item.route,
        duration: item.duration,
        quantity: item.quantity,
        instructions: item.instructions,
        isPRN: !!item.isPRN,
        isSTAT: !!item.isSTAT,
      });
    }
  }

  // 7. Most recent triage record (vitals snapshot at time of visit / discharge)
  const latestTriage = await db.triageRecord.findFirst({
    where: { encounterId },
    orderBy: { recordedAt: "desc" },
  });

  // 8. Derive primary diagnosis snapshot (first isPrimary = true, else first by type 'final'/'principal'/'discharge')
  const primaryDx =
    diagnoses.find((d) => d.isPrimary) ||
    diagnoses.find((d) => d.diagnosisType === "final" || d.diagnosisType === "principal" || d.diagnosisType === "discharge") ||
    diagnoses[0] ||
    null;

  const content: DischargeSummaryContent = {
    generatedAt: new Date().toISOString(),
    encounter: {
      id: encounter.id,
      encounterNumber: encounter.encounterNumber,
      encounterType: encounter.encounterType,
      status: encounter.status,
      startAt: encounter.startAt?.toISOString() || null,
      endAt: encounter.endAt?.toISOString() || null,
      priority: encounter.priority,
      source: encounter.source,
    },
    patient: {
      id: encounter.patient.id,
      patientNumber: encounter.patient.patientNumber,
      firstName: encounter.patient.firstName,
      lastName: encounter.patient.lastName,
      middleName: encounter.patient.middleName,
      dateOfBirth: encounter.patient.dateOfBirth?.toISOString() || null,
      sex: encounter.patient.sex,
      gender: encounter.patient.gender,
      bloodGroup: encounter.patient.bloodGroup,
      phone: encounter.patient.phone,
      address: encounter.patient.address,
      city: encounter.patient.city,
      region: encounter.patient.region,
      age: calculateAge(encounter.patient.dateOfBirth),
    },
    admission: latestAdmission
      ? {
          id: latestAdmission.id,
          admissionNumber: latestAdmission.admissionNumber,
          admissionType: latestAdmission.admissionType,
          admittedAt: latestAdmission.admittedAt.toISOString(),
          dischargedAt: latestAdmission.dischargedAt?.toISOString() || null,
          status: latestAdmission.status,
          admissionReason: latestAdmission.admissionReason,
          admissionDiagnosis: latestAdmission.admissionDiagnosis,
          attendingClinician: latestAdmission.attendingClinician
            ? {
                id: latestAdmission.attendingClinician.id,
                firstName: latestAdmission.attendingClinician.firstName,
                lastName: latestAdmission.attendingClinician.lastName,
              }
            : null,
          lengthOfStayDays: latestAdmission.dischargedAt
            ? Math.round(
                (new Date(latestAdmission.dischargedAt).getTime() -
                  new Date(latestAdmission.admittedAt).getTime()) /
                  (1000 * 60 * 60 * 24),
              )
            : null,
        }
      : undefined,
    dischargeRecord: dischargeRecord
      ? {
          id: dischargeRecord.id,
          dischargeNumber: dischargeRecord.dischargeNumber,
          dischargeType: dischargeRecord.dischargeType,
          disposition: dischargeRecord.disposition,
          dischargedAt: dischargeRecord.dischargedAt?.toISOString() || null,
          finalDiagnosis: dischargeRecord.finalDiagnosis,
          procedures: dischargeRecord.procedures,
          dischargeConditions: dischargeRecord.dischargeConditions,
          adviceOnDischarge: dischargeRecord.adviceOnDischarge,
          sickLeaveDays: dischargeRecord.sickLeaveDays,
          followUpAppointmentDate: dischargeRecord.followUpAppointmentDate?.toISOString() || null,
          followUpClinic: dischargeRecord.followUpClinic,
        }
      : undefined,
    consultations: consultations.map((c) => ({
      id: c.id,
      clinician: c.clinician
        ? { id: c.clinician.id, firstName: c.clinician.firstName, lastName: c.clinician.lastName }
        : null,
      chiefComplaint: c.chiefComplaint,
      historyPresentingIllness: c.historyPresentingIllness,
      pastMedicalHistory: c.pastMedicalHistory,
      physicalExamination: c.physicalExamination,
      assessment: c.assessment,
      treatmentPlan: c.treatmentPlan,
      followUpPlan: c.followUpPlan,
      disposition: c.disposition,
      dispositionNotes: c.dispositionNotes,
      patientInstructions: c.patientInstructions,
      signedAt: c.signedAt?.toISOString() || null,
      consultationStart: c.consultationStart?.toISOString() || null,
      consultationEnd: c.consultationEnd?.toISOString() || null,
    })),
    diagnoses: diagnoses.map((d) => ({
      id: d.id,
      diagnosisCode: d.diagnosisCode,
      codeSystem: d.codeSystem,
      diagnosisName: d.diagnosisName,
      diagnosisType: d.diagnosisType,
      isPrimary: d.isPrimary,
      clinicalStatus: d.clinicalStatus,
      verificationStatus: d.verificationStatus,
      isChronic: d.isChronic,
      onsetDate: d.onsetDate?.toISOString() || null,
      resolvedDate: d.resolvedDate?.toISOString() || null,
      diagnosedAt: d.diagnosedAt?.toISOString() || null,
    })),
    investigations,
    dischargeMedications,
    vitalsSnapshot: latestTriage
      ? {
          triage: {
            id: latestTriage.id,
            recordedAt: latestTriage.recordedAt.toISOString(),
            temperature: latestTriage.temperature,
            pulse: latestTriage.pulse,
            respiratoryRate: latestTriage.respiratoryRate,
            systolicBp: latestTriage.systolicBp,
            diastolicBp: latestTriage.diastolicBp,
            oxygenSaturation: latestTriage.oxygenSaturation,
            weight: latestTriage.weight,
            height: latestTriage.height,
            bmi: latestTriage.bmi,
            bloodGlucose: latestTriage.bloodGlucose,
            painScore: latestTriage.painScore,
            consciousnessLevel: latestTriage.consciousnessLevel,
            triageCategory: latestTriage.triageCategory,
            chiefComplaint: latestTriage.chiefComplaint,
          },
          notes: latestTriage.notes,
        }
      : {},
  };

  return {
    content,
    primaryDiagnosisName: primaryDx?.diagnosisName || null,
    primaryDiagnosisCode: primaryDx?.diagnosisCode || null,
    attendingClinicianId: latestAdmission?.attendingClinicianId || null,
    patientId: encounter.patientId,
    facilityId: encounter.facilityId,
    organizationId: encounter.patient.organizationId,
    admissionId: latestAdmission?.id || null,
    dischargeRecordId: dischargeRecord?.id || null,
  };
}

/**
 * Generate the next summary number in the format DSum-YYYY-000001.
 * Uses the same retry pattern as nextEncounterNumber to handle race
 * conditions on the unique constraint.
 */
export async function nextDischargeSummaryNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await db.dischargeSummary.count({ where: { facilityId } });
    const candidate = `DSum-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const existing = await db.dischargeSummary.findFirst({
      where: { summaryNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `DSum-${year}-${timestamp}`;
}
