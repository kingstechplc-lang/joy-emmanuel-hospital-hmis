// =====================================================================
// LAB RESULTS — auto-flagging helper
// Compares a numeric result against the test's configured reference
// ranges and critical values from the Lab Test Catalog, returning the
// appropriate abnormalFlag + criticalFlag + flagSource + flagRangeApplied.
// =====================================================================
import { db } from "@/lib/db";

export interface AutoFlagResult {
  abnormalFlag: string; // normal | low | high | critical_low | critical_high
  criticalFlag: boolean;
  isCritical: boolean;
  flagSource: string; // manual | auto_ref_range | auto_critical_value
  flagRangeApplied: string | null;
  matchedRangeId?: string;
  matchedCriticalId?: string;
}

export interface PatientContext {
  sex?: string | null;
  dateOfBirth?: Date | null;
  isPregnant?: boolean;
}

/**
 * Compute age in days from date of birth.
 */
function ageInDays(dob: Date | null | undefined): number | null {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

/**
 * Determine the age group label from age in days.
 */
function ageGroupFromDays(days: number | null): string | null {
  if (days == null) return null;
  if (days < 28) return "neonate";
  if (days < 365) return "infant";
  if (days < 365 * 4) return "child";
  if (days < 365 * 13) return "adolescent";
  if (days < 365 * 65) return "adult";
  return "older_adult";
}

/**
 * Auto-flag a numeric result against the test's configured reference ranges
 * and critical values. Returns the computed flag + source metadata.
 *
 * Does NOT fabricate ranges — only uses what's configured in the catalog.
 * If no ranges/critical values are configured, returns flagSource="manual".
 */
export async function autoFlagResult(params: {
  laboratoryTestId: string;
  numericValue: number;
  patient: PatientContext;
  specimenType?: string | null;
  facilityId?: string | null;
}): Promise<AutoFlagResult> {
  const { laboratoryTestId, numericValue, patient, specimenType, facilityId } = params;

  // Fetch active reference ranges and critical values for this test
  const [ranges, criticals] = await Promise.all([
    db.labTestReferenceRange.findMany({
      where: {
        laboratoryTestId,
        status: "active",
        effectiveTo: null,
      },
    }),
    db.labTestCriticalValue.findMany({
      where: {
        laboratoryTestId,
        status: "active",
      },
    }),
  ]);

  if (ranges.length === 0 && criticals.length === 0) {
    return {
      abnormalFlag: "normal",
      criticalFlag: false,
      isCritical: false,
      flagSource: "manual",
      flagRangeApplied: null,
    };
  }

  const patientAgeDays = ageInDays(patient.dateOfBirth);
  const patientAgeGroup = ageGroupFromDays(patientAgeDays);
  const patientSex = patient.sex || null;

  // ---- Step 1: Check critical values first (highest priority) ----
  for (const cv of criticals) {
    // Match sex
    if (cv.sex && cv.sex !== "all" && cv.sex !== patientSex) continue;
    // Match age group
    if (cv.ageGroup && cv.ageGroup !== "all" && cv.ageGroup !== patientAgeGroup) continue;
    // Match age range
    if (cv.ageMinDays != null && patientAgeDays != null && patientAgeDays < cv.ageMinDays) continue;
    if (cv.ageMaxDays != null && patientAgeDays != null && patientAgeDays > cv.ageMaxDays) continue;

    if (cv.alertType === "numeric") {
      if (cv.criticalLow != null && numericValue <= cv.criticalLow) {
        return {
          abnormalFlag: "critical_low",
          criticalFlag: true,
          isCritical: true,
          flagSource: "auto_critical_value",
          flagRangeApplied: `Critical low ≤ ${cv.criticalLow}`,
          matchedCriticalId: cv.id,
        };
      }
      if (cv.criticalHigh != null && numericValue >= cv.criticalHigh) {
        return {
          abnormalFlag: "critical_high",
          criticalFlag: true,
          isCritical: true,
          flagSource: "auto_critical_value",
          flagRangeApplied: `Critical high ≥ ${cv.criticalHigh}`,
          matchedCriticalId: cv.id,
        };
      }
    }
  }

  // ---- Step 2: Check reference ranges ----
  for (const r of ranges) {
    // Match sex
    if (r.sex && r.sex !== "all" && r.sex !== patientSex) continue;
    // Match age group
    if (r.ageGroup && r.ageGroup !== "all" && r.ageGroup !== patientAgeGroup) continue;
    // Match age range
    if (r.ageMinDays != null && patientAgeDays != null && patientAgeDays < r.ageMinDays) continue;
    if (r.ageMaxDays != null && patientAgeDays != null && patientAgeDays > r.ageMaxDays) continue;
    // Match specimen type
    if (r.specimenType && specimenType && r.specimenType !== specimenType) continue;
    // Match facility
    if (r.facilityId && facilityId && r.facilityId !== facilityId) continue;
    // Pregnancy
    if (r.pregnancyApplicable && !patient.isPregnant) continue;

    const low = r.lowText ? parseFloat(r.lowText) : null;
    const high = r.highText ? parseFloat(r.highText) : null;

    if (low != null && numericValue < low) {
      return {
        abnormalFlag: "low",
        criticalFlag: false,
        isCritical: false,
        flagSource: "auto_ref_range",
        flagRangeApplied: r.rangeText || `${r.lowText} - ${r.highText}`,
        matchedRangeId: r.id,
      };
    }
    if (high != null && numericValue > high) {
      return {
        abnormalFlag: "high",
        criticalFlag: false,
        isCritical: false,
        flagSource: "auto_ref_range",
        flagRangeApplied: r.rangeText || `${r.lowText} - ${r.highText}`,
        matchedRangeId: r.id,
      };
    }
    // If within this range, it's normal
    if ((low == null || numericValue >= low) && (high == null || numericValue <= high)) {
      return {
        abnormalFlag: "normal",
        criticalFlag: false,
        isCritical: false,
        flagSource: "auto_ref_range",
        flagRangeApplied: r.rangeText || `${r.lowText} - ${r.highText}`,
        matchedRangeId: r.id,
      };
    }
  }

  // No range matched — return manual (no auto-flag)
  return {
    abnormalFlag: "normal",
    criticalFlag: false,
    isCritical: false,
    flagSource: "manual",
    flagRangeApplied: null,
  };
}
