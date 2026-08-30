// =====================================================================
// NHIA CLAIM-it Validation Engine
// =====================================================================
// Validates an IntermediateClaimsObject BEFORE XML generation.
// Never queries the database — pure validation logic.
// =====================================================================

import type { IntermediateClaimsObject, ValidationResult, ValidationError } from "../types/claims";
import { isValidICD10, normalizeMemberNumber } from "../utils/xml";

export function validateICO(ico: IntermediateClaimsObject): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // --- Patient Validation ---
  if (!ico.patient.surname) {
    errors.push({ code: "PATIENT_SURNAME_MISSING", category: "VALIDATION", field: "patient.surname", message: "Patient surname is required.", severity: "ERROR" });
  }
  if (!ico.patient.otherNames) {
    errors.push({ code: "PATIENT_OTHER_NAMES_MISSING", category: "VALIDATION", field: "patient.otherNames", message: "Patient other names is required.", severity: "ERROR" });
  }
  const nhisNum = normalizeMemberNumber(ico.patient.nhisNumber);
  if (!nhisNum) {
    errors.push({ code: "NHIS_MEMBER_ID_MISSING", category: "VALIDATION", field: "patient.nhisNumber", message: "NHIS member number is required for NHIA claims.", severity: "ERROR" });
  } else if (nhisNum.length < 8) {
    warnings.push({ code: "NHIS_MEMBER_ID_SHORT", category: "VALIDATION", field: "patient.nhisNumber", message: `NHIS member number "${nhisNum}" appears unusually short (${nhisNum.length} chars).`, severity: "WARNING" });
  }
  if (!ico.patient.dateOfBirth) {
    warnings.push({ code: "PATIENT_DOB_MISSING", category: "VALIDATION", field: "patient.dateOfBirth", message: "Patient date of birth is missing.", severity: "WARNING" });
  }
  if (!ico.patient.sex) {
    warnings.push({ code: "PATIENT_SEX_MISSING", category: "VALIDATION", field: "patient.sex", message: "Patient sex is missing.", severity: "WARNING" });
  }

  // --- Facility Validation ---
  if (!ico.facility.facilityCode) {
    errors.push({ code: "FACILITY_CODE_MISSING", category: "VALIDATION", field: "facility.facilityCode", message: "Facility NHIA code is required.", severity: "ERROR" });
  }
  if (!ico.facility.facilityName) {
    errors.push({ code: "FACILITY_NAME_MISSING", category: "VALIDATION", field: "facility.facilityName", message: "Facility name is required.", severity: "ERROR" });
  }

  // --- Encounter Validation ---
  if (!ico.encounter.visitDate) {
    errors.push({ code: "ENCOUNTER_DATE_MISSING", category: "VALIDATION", field: "encounter.visitDate", message: "Visit date is required.", severity: "ERROR" });
  }
  if (!ico.encounter.encounterType) {
    errors.push({ code: "ENCOUNTER_TYPE_MISSING", category: "VALIDATION", field: "encounter.encounterType", message: "Encounter type is required.", severity: "ERROR" });
  }

  // --- Attendance Verification ---
  if (ico.attendanceVerification.verificationStatus === "PENDING") {
    warnings.push({ code: "ATTENDANCE_PENDING", category: "VALIDATION", field: "attendanceVerification.verificationStatus", message: "Attendance verification is still pending.", severity: "WARNING" });
  }
  if (ico.attendanceVerification.verificationStatus === "FAILED") {
    errors.push({ code: "ATTENDANCE_FAILED", category: "VALIDATION", field: "attendanceVerification.verificationStatus", message: "Attendance verification failed. Claim cannot be submitted.", severity: "ERROR" });
  }
  if (ico.attendanceVerification.method === "CCC" && !ico.attendanceVerification.code) {
    warnings.push({ code: "CCC_CODE_MISSING", category: "VALIDATION", field: "attendanceVerification.code", message: "CCC method selected but no CCC code provided.", severity: "WARNING" });
  }

  // --- Diagnoses Validation ---
  if (ico.diagnoses.length === 0) {
    errors.push({ code: "NO_DIAGNOSES", category: "VALIDATION", field: "diagnoses", message: "At least one diagnosis is required.", severity: "ERROR" });
  } else {
    const primaryCount = ico.diagnoses.filter(d => d.isPrimary).length;
    if (primaryCount === 0) {
      errors.push({ code: "NO_PRIMARY_DIAGNOSIS", category: "VALIDATION", field: "diagnoses", message: "At least one primary diagnosis is required.", severity: "ERROR" });
    }
    if (primaryCount > 1) {
      warnings.push({ code: "MULTIPLE_PRIMARY_DIAGNOSES", category: "VALIDATION", field: "diagnoses", message: "Multiple primary diagnoses found. Only the first will be used as primary.", severity: "WARNING" });
    }
    for (const dx of ico.diagnoses) {
      if (!isValidICD10(dx.diagnosisCode)) {
        errors.push({ code: "INVALID_ICD10", category: "VALIDATION", field: `diagnoses[${dx.diagnosisCode}].diagnosisCode`, message: `Invalid ICD-10 code: "${dx.diagnosisCode}".`, severity: "ERROR" });
      }
    }
  }

  // --- Services Validation ---
  for (const svc of ico.services) {
    if (svc.quantity <= 0) {
      errors.push({ code: "INVALID_SERVICE_QUANTITY", category: "VALIDATION", field: `services[${svc.internalItemId}].quantity`, message: `Service quantity must be > 0 for "${svc.serviceDescription}".`, severity: "ERROR" });
    }
    if (svc.unitPrice < 0) {
      errors.push({ code: "INVALID_SERVICE_PRICE", category: "VALIDATION", field: `services[${svc.internalItemId}].unitPrice`, message: `Service unit price cannot be negative for "${svc.serviceDescription}".`, severity: "ERROR" });
    }
    if (!svc.nhisTariffCode) {
      warnings.push({ code: "SERVICE_TARIFF_CODE_MISSING", category: "VALIDATION", field: `services[${svc.internalItemId}].nhisTariffCode`, message: `NHIS tariff code missing for service "${svc.serviceDescription}".`, severity: "WARNING" });
    }
    if (svc.totalAmount !== svc.unitPrice * svc.quantity) {
      warnings.push({ code: "SERVICE_AMOUNT_MISMATCH", category: "VALIDATION", field: `services[${svc.internalItemId}].totalAmount`, message: `Service total (${svc.totalAmount}) != unitPrice * quantity (${svc.unitPrice * svc.quantity}) for "${svc.serviceDescription}".`, severity: "WARNING" });
    }
  }

  // --- Drugs Validation ---
  for (const drug of ico.drugs) {
    if (drug.quantity <= 0) {
      errors.push({ code: "INVALID_DRUG_QUANTITY", category: "VALIDATION", field: `drugs[${drug.internalItemId}].quantity`, message: `Drug quantity must be > 0 for "${drug.medicineName}".`, severity: "ERROR" });
    }
    if (drug.unitPrice < 0) {
      errors.push({ code: "INVALID_DRUG_PRICE", category: "VALIDATION", field: `drugs[${drug.internalItemId}].unitPrice`, message: `Drug unit price cannot be negative for "${drug.medicineName}".`, severity: "ERROR" });
    }
    if (!drug.nhisMedicineCode) {
      warnings.push({ code: "DRUG_CODE_MISSING", category: "VALIDATION", field: `drugs[${drug.internalItemId}].nhisMedicineCode`, message: `NHIS medicine code missing for drug "${drug.medicineName}".`, severity: "WARNING" });
    }
    if (drug.totalAmount !== drug.unitPrice * drug.quantity) {
      warnings.push({ code: "DRUG_AMOUNT_MISMATCH", category: "VALIDATION", field: `drugs[${drug.internalItemId}].totalAmount`, message: `Drug total (${drug.totalAmount}) != unitPrice * quantity (${drug.unitPrice * drug.quantity}) for "${drug.medicineName}".`, severity: "WARNING" });
    }
  }

  // --- Totals Validation ---
  const computedServiceTotal = ico.services.reduce((sum, s) => sum + s.totalAmount, 0);
  const computedDrugTotal = ico.drugs.reduce((sum, d) => sum + d.totalAmount, 0);
  const computedGross = computedServiceTotal + computedDrugTotal;

  if (Math.abs(ico.totals.totalServiceAmount - computedServiceTotal) > 0.01) {
    errors.push({ code: "SERVICE_TOTAL_MISMATCH", category: "VALIDATION", field: "totals.totalServiceAmount", message: `Service total (${ico.totals.totalServiceAmount}) does not match sum of service items (${computedServiceTotal}).`, severity: "ERROR" });
  }
  if (Math.abs(ico.totals.totalDrugAmount - computedDrugTotal) > 0.01) {
    errors.push({ code: "DRUG_TOTAL_MISMATCH", category: "VALIDATION", field: "totals.totalDrugAmount", message: `Drug total (${ico.totals.totalDrugAmount}) does not match sum of drug items (${computedDrugTotal}).`, severity: "ERROR" });
  }
  if (Math.abs(ico.totals.grossAmount - computedGross) > 0.01) {
    errors.push({ code: "GROSS_TOTAL_MISMATCH", category: "VALIDATION", field: "totals.grossAmount", message: `Gross amount (${ico.totals.grossAmount}) does not match computed gross (${computedGross}).`, severity: "ERROR" });
  }
  const computedNet = ico.totals.grossAmount - ico.totals.totalDeductions;
  if (Math.abs(ico.totals.netAmount - computedNet) > 0.01) {
    errors.push({ code: "NET_TOTAL_MISMATCH", category: "VALIDATION", field: "totals.netAmount", message: `Net amount (${ico.totals.netAmount}) does not match gross - deductions (${computedNet}).`, severity: "ERROR" });
  }

  // --- No items at all ---
  if (ico.services.length === 0 && ico.drugs.length === 0) {
    errors.push({ code: "NO_CLAIM_ITEMS", category: "VALIDATION", field: "services/drugs", message: "Claim has no service or drug items.", severity: "ERROR" });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
