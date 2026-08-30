// =====================================================================
// NHIA CLAIM-it XML Tag Configuration
// =====================================================================
// Centralized XML tag names. These are CONFIGURABLE — not hard-coded in
// business logic. If NHIA changes tag names, update them here.
//
// IMPORTANT: The tag names below are based on analysis of the CLAIM-it
// documentation and standard NHIS claims XML conventions. Where the exact
// tag name could not be verified from the official documentation, it is
// marked with "REQUIRES NHIA CONFIRMATION".
// =====================================================================

export const NHIA_XML_TAGS = {
  // Root element
  ROOT: "Claims",
  CLAIM: "Claim",

  // Header
  HEADER: "Header",
  CLAIM_BATCH_REF: "ClaimBatchRef",
  CLAIM_NUMBER: "ClaimNumber",
  SUBMISSION_PERIOD: "SubmissionPeriod",
  GENERATED_AT: "GeneratedAt",
  SCHEMA_VERSION: "SchemaVersion",
  TRANSACTION_TYPE: "TransactionType",
  CURRENCY: "Currency",
  FACILITY_CODE: "FacilityCode",
  PROVIDER_ID: "ProviderId",

  // Facility
  FACILITY: "Facility",
  FACILITY_ID: "FacilityId",
  FACILITY_NAME: "FacilityName",
  HPN: "HPN",
  REGION: "Region",
  DISTRICT: "District",
  FACILITY_TYPE: "FacilityType",
  OWNERSHIP: "Ownership",

  // Patient / Member
  PATIENT: "Patient",
  PATIENT_ID: "PatientId",
  PATIENT_NUMBER: "PatientNumber",
  MEMBER_NUMBER: "MemberNumber",
  GHANA_CARD_PIN: "GhanaCardPIN", // REQUIRES NHIA CONFIRMATION
  CARD_SERIAL_NUMBER: "CardSerialNumber",
  SURNAME: "Surname",
  OTHER_NAMES: "OtherNames",
  DATE_OF_BIRTH: "DateOfBirth",
  SEX: "Sex",
  PHONE: "Phone",
  INSURANCE_PROVIDER: "InsuranceProvider",
  INSURANCE_MEMBERSHIP_STATUS: "InsuranceMembershipStatus",
  NHIS_ELIGIBILITY_STATUS: "NhisEligibilityStatus",

  // Encounter / Visit
  ENCOUNTER: "Encounter",
  ENCOUNTER_ID: "EncounterId",
  ENCOUNTER_NUMBER: "EncounterNumber",
  VISIT_DATE: "VisitDate",
  ARRIVAL_TIME: "ArrivalTime",
  ENCOUNTER_TYPE: "EncounterType",
  OPD_IPD_STATUS: "OpdIpdStatus",
  DEPARTMENT: "Department",
  SPECIALTY: "Specialty",
  ATTENDING_PROVIDER: "AttendingProvider",
  ADMISSION_DATE: "AdmissionDate",
  DISCHARGE_DATE: "DischargeDate",

  // Referral
  REFERRAL: "Referral",
  REFERRING_FACILITY_NAME: "ReferringFacilityName",
  REFERRING_FACILITY_CODE: "ReferringFacilityCode",
  REFERRING_FACILITY_CCC: "ReferringFacilityCCC",
  REFERRAL_DATE: "ReferralDate",
  REFERRAL_REASON: "ReferralReason",

  // Attendance Verification
  ATTENDANCE_VERIFICATION: "AttendanceVerification",
  ATTENDANCE_METHOD: "Method",
  ATTENDANCE_CODE: "Code",
  VERIFIED_AT: "VerifiedAt",
  VERIFICATION_STATUS: "VerificationStatus",
  VERIFICATION_SOURCE: "Source",

  // Diagnoses
  DIAGNOSES: "Diagnoses",
  DIAGNOSIS: "Diagnosis",
  DIAGNOSIS_CODE: "DiagnosisCode",
  DIAGNOSIS_DESCRIPTION: "DiagnosisDescription",
  DIAGNOSIS_TYPE: "DiagnosisType",
  CODING_SYSTEM: "CodingSystem",
  GDRG_CODE: "GDRGCode",
  GDRG_NAME: "GDRGName",
  IS_PRIMARY: "IsPrimary",

  // Services
  SERVICES: "Services",
  SERVICE: "Service",
  SERVICE_ITEM_ID: "ItemId",
  NHIS_TARIFF_CODE: "NhisTariffCode",
  SERVICE_CODE: "ServiceCode",
  SERVICE_DESCRIPTION: "ServiceDescription",
  SERVICE_QUANTITY: "Quantity",
  SERVICE_UNIT_PRICE: "UnitPrice",
  SERVICE_APPROVED_PRICE: "ApprovedTariffPrice",
  SERVICE_TOTAL: "TotalAmount",
  SERVICE_DATE: "ServiceDate",
  SERVICE_DEPARTMENT: "ServiceDepartment",
  SERVICE_PROVIDER: "ServiceProvider",
  SERVICE_STATUS: "ItemStatus",
  SERVICE_GDRG_CODE: "GDRGCode",
  SERVICE_GDRG_NAME: "GDRGName",
  SERVICE_CATEGORY: "ServiceCategory",

  // Drugs / Medicines
  DRUGS: "Drugs",
  DRUG: "Drug",
  DRUG_ITEM_ID: "ItemId",
  NHIS_MEDICINE_CODE: "NhisMedicineCode",
  GNDL_CODE: "GNDLCode",
  MEDICINE_NAME: "MedicineName",
  MEDICINE_STRENGTH: "Strength",
  MEDICINE_FORMULATION: "Formulation",
  DRUG_QUANTITY: "Quantity",
  DRUG_UNIT: "Unit",
  DRUG_UNIT_PRICE: "UnitPrice",
  DRUG_APPROVED_PRICE: "ApprovedNhisPrice",
  DRUG_TOTAL: "TotalAmount",
  DISPENSING_DATE: "DispensingDate",
  PRESCRIPTION: "Prescription",
  PRESCRIBER_ID: "PrescriberId",
  PHARMACIST_ID: "PharmacistId",
  DRUG_STATUS: "ItemStatus",

  // Totals
  TOTALS: "Totals",
  TOTAL_SERVICE_AMOUNT: "TotalServiceAmount",
  TOTAL_DRUG_AMOUNT: "TotalDrugAmount",
  GROSS_AMOUNT: "GrossAmount",
  TOTAL_DEDUCTIONS: "TotalDeductions",
  PATIENT_AMOUNT: "PatientAmount",
  NHIS_AMOUNT: "NhisAmount",
  NET_AMOUNT: "NetAmount",

  // Metadata
  METADATA: "Metadata",
  SOURCE_SYSTEM: "SourceSystem",
  SOURCE_VERSION: "SourceVersion",
  TARIFF_SCHEDULE_VERSION: "TariffScheduleVersion",
  MEDICINE_PRICE_VERSION: "MedicinePriceVersion",
  BASE_DATA_VERSION: "BaseDataVersion",
} as const;

// XML namespace and encoding configuration
export const NHIA_XML_CONFIG = {
  ENCODING: "UTF-8",
  VERSION: "1.0",
  STANDALONE: "yes",
  NAMESPACE: null as string | null, // REQUIRES NHIA CONFIRMATION — no namespace documented
  ROOT_ATTRIBUTE_SCHEMA_VERSION: "2.0", // CLAIM-it v2.0.0
  DATE_FORMAT: "yyyy-MM-dd",
  DATETIME_FORMAT: "yyyy-MM-dd'T'HH:mm:ss",
  DECIMAL_PLACES: 2,
  CURRENCY: "GHS",
} as const;
