// =====================================================================
// NHIA CLAIM-it Integration Types
// =====================================================================
// Canonical Intermediate Claims Object (ICO) — independent of NHIA XML structure.
// Represents healthcare claim business data, NOT XML syntax.
// =====================================================================

// --- Attendance Verification (CCC vs OTAC kept separate) ---
export type AttendanceMethod = "CCC" | "OTAC" | "BIOMETRIC" | "OTHER";
export type VerificationStatus = "VERIFIED" | "PENDING" | "FAILED" | "NOT_REQUIRED";

export interface AttendanceVerification {
  method: AttendanceMethod;
  code: string | null;
  verifiedAt: Date | null;
  verificationStatus: VerificationStatus;
  source: string | null;
  transactionRef: string | null;
}

// --- ICO Header ---
export interface ICOHeader {
  claimBatchRef: string;
  claimNumber: string;
  submissionPeriod: string; // "2026-08"
  generatedAt: Date;
  schemaVersion: string;
  transactionType: "NEW" | "RESUBMISSION" | "AMENDMENT";
  currency: string; // "GHS"
  facilityCode: string;
  providerId: string | null;
}

// --- ICO Facility ---
export interface ICOFacility {
  facilityId: string;
  facilityCode: string;
  facilityName: string;
  hpn: string | null;
  region: string | null;
  district: string | null;
  facilityType: string | null;
  ownership: string | null;
}

// --- ICO Patient ---
export interface ICOPatient {
  internalPatientId: string;
  patientNumber: string | null;
  nhisNumber: string | null;
  ghanaCardPin: string | null;
  cardSerialNumber: string | null;
  surname: string;
  otherNames: string;
  dateOfBirth: Date | null;
  sex: "M" | "F" | "U" | null;
  phone: string | null;
  insuranceProvider: string | null;
  insuranceMembershipStatus: string | null;
  nhisEligibilityStatus: string | null;
}

// --- ICO Encounter ---
export interface ICOEncounter {
  encounterId: string;
  encounterNumber: string;
  visitDate: Date;
  arrivalTime: Date | null;
  encounterType: "OPD" | "IPD" | "EMERGENCY" | "DAY_CASE" | "PHARMACY" | "LAB" | "OTHER";
  opdIpdStatus: "OPD" | "IPD" | "DAY_CASE";
  department: string | null;
  specialty: string | null;
  attendingProvider: string | null;
  admissionDate: Date | null;
  dischargeDate: Date | null;
  referralInfo: ICOReferral | null;
}

// --- ICO Referral ---
export interface ICOReferral {
  referringFacilityName: string | null;
  referringFacilityCode: string | null;
  referringFacilityCCC: string | null;
  referralDate: Date | null;
  referralReason: string | null;
}

// --- ICO Diagnosis ---
export interface ICODiagnosis {
  diagnosisCode: string; // ICD-10
  diagnosisDescription: string;
  diagnosisType: "PRIMARY" | "SECONDARY" | "ADMISSION" | "DISCHARGE" | "WORKING";
  codingSystem: string; // "ICD-10"
  gdrgCode: string | null;
  gdrgName: string | null;
  isPrimary: boolean;
}

// --- ICO Service Item ---
export interface ICOServiceItem {
  internalItemId: string;
  nhisTariffCode: string | null;
  serviceCode: string | null;
  serviceDescription: string;
  quantity: number;
  unitPrice: number;
  approvedTariffPrice: number | null;
  totalAmount: number;
  serviceDate: Date;
  department: string | null;
  provider: string | null;
  itemStatus: "ACTIVE" | "REVERSED" | "CANCELLED";
  gdrgCode: string | null;
  gdrgName: string | null;
  serviceCategory: "PROCEDURE" | "DIAGNOSIS" | "INVESTIGATION" | "CONSULTATION" | "OTHER";
}

// --- ICO Drug Item ---
export interface ICODrugItem {
  internalItemId: string;
  nhisMedicineCode: string | null;
  gndlCode: string | null;
  medicineName: string;
  strength: string | null;
  formulation: string | null;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  approvedNhisPrice: number | null;
  totalAmount: number;
  dispensingDate: Date;
  prescription: string | null; // "250mg x tds x 5 days"
  prescriberId: string | null;
  pharmacistId: string | null;
  itemStatus: "ACTIVE" | "REVERSED" | "RETURNED";
}

// --- ICO Totals ---
export interface ICOTotals {
  totalServiceAmount: number;
  totalDrugAmount: number;
  grossAmount: number;
  totalDeductions: number;
  patientAmount: number;
  nhisAmount: number;
  netAmount: number;
}

// --- ICO Metadata ---
export interface ICOMetadata {
  sourceSystem: string;
  sourceVersion: string;
  tariffScheduleVersion: string | null;
  medicinePriceVersion: string | null;
  baseDataVersion: string | null;
  encounterId: string;
  invoiceId: string | null;
  insuranceClaimId: string | null;
}

// --- Complete Intermediate Claims Object ---
export interface IntermediateClaimsObject {
  header: ICOHeader;
  facility: ICOFacility;
  patient: ICOPatient;
  encounter: ICOEncounter;
  attendanceVerification: AttendanceVerification;
  diagnoses: ICODiagnosis[];
  services: ICOServiceItem[];
  drugs: ICODrugItem[];
  totals: ICOTotals;
  metadata: ICOMetadata;
}

// --- Validation Types ---
export type ValidationErrorSeverity = "ERROR" | "WARNING" | "INFO";

export interface ValidationError {
  code: string;
  category: "VALIDATION" | "MAPPING" | "SCHEMA" | "SERIALIZATION" | "TRANSPORT" | "CONFIGURATION";
  field: string;
  message: string;
  severity: ValidationErrorSeverity;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// --- Export/Transport Types ---
export type ClaimStatus =
  | "DRAFT"
  | "READY_FOR_VALIDATION"
  | "VALIDATED"
  | "XML_GENERATED"
  | "EXPORTED"
  | "SUBMITTED"
  | "ACKNOWLEDGED"
  | "ACCEPTED"
  | "REJECTED"
  | "QUERIED";

export interface ExportResult {
  success: boolean;
  claimRef: string;
  xmlPayload?: string;
  filePath?: string;
  submissionRef?: string;
  errors: ValidationError[];
  timestamp: Date;
}

export interface HealthCheckResult {
  reachable: boolean;
  version?: string;
  endpoint?: string;
  error?: string;
}
