// =====================================================================
// IMMUNIZATION SCHEDULE ENGINE
// =====================================================================
// Computes due/overdue/upcoming vaccines for a patient based on:
//   1. The patient's date of birth (age in days)
//   2. The org's VaccineScheduleDose rules (which dose at which age)
//   3. The patient's existing Immunization records (which doses are done)
//
// This engine is READ-ONLY — it never creates records or modifies state.
// The API routes use it to compute due lists; the UI uses the API.
// =====================================================================
import { db } from "./db";

export type DueStatus = "completed" | "due_now" | "overdue" | "upcoming" | "not_due" | "missed";

export interface ScheduleEntry {
  vaccineCatalogId: string;
  vaccineCode: string;
  vaccineName: string;
  doseNumber: number;
  doseLabel: string;
  ageAtDueDays: number;
  ageAtOverdueDays: number;
  dueDate: Date;          // Calendar date when this dose becomes due
  overdueDate: Date;      // Calendar date when this dose becomes overdue
  status: DueStatus;
  daysUntilDue: number;   // Negative = overdue/past
  administeredImmunizationId?: string; // Set if this dose was already given
  administeredAt?: Date;
  batchNumber?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function ageInDays(dob: Date): number {
  return Math.floor((Date.now() - new Date(dob).getTime()) / MS_PER_DAY);
}

function dateAtAge(dob: Date, ageDays: number): Date {
  return new Date(new Date(dob).getTime() + ageDays * MS_PER_DAY);
}

/**
 * Compute the full immunization schedule for a patient.
 * Returns one entry per (vaccine, dose) in the org's schedule, annotated
 * with the patient's status (completed / due_now / overdue / upcoming / not_due).
 *
 * @param patientId  The patient whose schedule to compute.
 * @param organizationId  The org whose schedule rules to use.
 * @returns Array of schedule entries, sorted by dueDate ascending.
 */
export async function computePatientSchedule(
  patientId: string,
  organizationId: string
): Promise<ScheduleEntry[]> {
  // 1. Load the patient
  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: { id: true, dateOfBirth: true, sex: true },
  });
  if (!patient || !patient.dateOfBirth) return [];

  const dob = new Date(patient.dateOfBirth);
  const patientAgeDays = ageInDays(dob);
  const patientSex = (patient.sex || "").toLowerCase();

  // 2. Load all active schedule doses for this org, with vaccine info
  const scheduleDoses = await db.vaccineScheduleDose.findMany({
    where: { organizationId, isActive: true },
    include: {
      vaccineCatalog: { select: { id: true, code: true, name: true, isActive: true } },
    },
  });

  // Filter by sex applicability (e.g., HPV for girls only)
  const applicableDoses = scheduleDoses.filter((d) => {
    if (!d.vaccineCatalog || !d.vaccineCatalog.isActive) return false;
    if (!d.appliesToSex || d.appliesToSex === "all") return true;
    return d.appliesToSex.toLowerCase() === patientSex;
  });

  // 3. Load the patient's existing immunization records (completed doses only)
  const existingImmunizations = await db.immunization.findMany({
    where: {
      patientId,
      status: "completed",
    },
    select: {
      id: true,
      vaccineCatalogId: true,
      doseNumber: true,
      administeredAt: true,
      batchNumber: true,
    },
  });

  // Build a lookup: { vaccineCatalogId → Set(doseNumber) } for completed doses
  const completedMap = new Map<string, Map<number, typeof existingImmunizations[0]>>();
  for (const imm of existingImmunizations) {
    if (!imm.vaccineCatalogId || !imm.doseNumber) continue;
    if (!completedMap.has(imm.vaccineCatalogId)) {
      completedMap.set(imm.vaccineCatalogId, new Map());
    }
    completedMap.get(imm.vaccineCatalogId)!.set(imm.doseNumber, imm);
  }

  // 4. Compute status for each schedule dose
  const entries: ScheduleEntry[] = applicableDoses.map((dose) => {
    const dueDate = dateAtAge(dob, dose.ageAtDueDays);
    const overdueDate = dateAtAge(dob, dose.ageAtOverdueDays);
    const daysUntilDue = Math.floor((dueDate.getTime() - Date.now()) / MS_PER_DAY);

    const completed = completedMap
      .get(dose.vaccineCatalogId)
      ?.get(dose.doseNumber);

    let status: DueStatus;
    if (completed) {
      status = "completed";
    } else if (patientAgeDays >= dose.ageAtOverdueDays) {
      status = "overdue";
    } else if (patientAgeDays >= dose.ageAtDueDays) {
      status = "due_now";
    } else {
      // Patient is younger than the due age — upcoming
      status = "upcoming";
    }

    return {
      vaccineCatalogId: dose.vaccineCatalogId,
      vaccineCode: dose.vaccineCatalog.code,
      vaccineName: dose.vaccineCatalog.name,
      doseNumber: dose.doseNumber,
      doseLabel: dose.doseLabel,
      ageAtDueDays: dose.ageAtDueDays,
      ageAtOverdueDays: dose.ageAtOverdueDays,
      dueDate,
      overdueDate,
      status,
      daysUntilDue,
      administeredImmunizationId: completed?.id,
      administeredAt: completed?.administeredAt,
      batchNumber: completed?.batchNumber || undefined,
    };
  });

  // Sort by dueDate ascending (earliest due first)
  entries.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  return entries;
}

/**
 * Check for duplicate dose before administration.
 * Returns true if the patient already has a completed record for the same
 * vaccine + dose number.
 */
export async function isDuplicateDose(
  patientId: string,
  vaccineCatalogId: string,
  doseNumber: number
): Promise<boolean> {
  const count = await db.immunization.count({
    where: {
      patientId,
      vaccineCatalogId,
      doseNumber,
      status: "completed",
    },
  });
  return count > 0;
}

/**
 * Compute the next due dose for a vaccine series, given the patient's
 * existing records. Returns null if the series is complete or no schedule
 * rule exists for the next dose.
 */
export async function getNextDueDose(
  patientId: string,
  vaccineCatalogId: string,
  organizationId: string
): Promise<{ doseNumber: number; doseLabel: string; dueDate: Date } | null> {
  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: { dateOfBirth: true },
  });
  if (!patient || !patient.dateOfBirth) return null;

  const dob = new Date(patient.dateOfBirth);

  // Get all schedule doses for this vaccine, ordered by dose number
  const scheduleDoses = await db.vaccineScheduleDose.findMany({
    where: { organizationId, vaccineCatalogId, isActive: true },
    orderBy: { doseNumber: "asc" },
  });

  // Get completed doses for this vaccine
  const completed = await db.immunization.findMany({
    where: {
      patientId,
      vaccineCatalogId,
      status: "completed",
    },
    select: { doseNumber: true },
  });
  const completedDoseNumbers = new Set(completed.map((c) => c.doseNumber).filter(Boolean) as number[]);

  // Find the first schedule dose that hasn't been completed
  for (const dose of scheduleDoses) {
    if (!completedDoseNumbers.has(dose.doseNumber)) {
      const dueDate = dateAtAge(dob, dose.ageAtDueDays);
      return {
        doseNumber: dose.doseNumber,
        doseLabel: dose.doseLabel,
        dueDate,
      };
    }
  }

  return null; // Series complete
}
