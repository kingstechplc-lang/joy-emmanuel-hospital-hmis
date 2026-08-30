// =====================================================================
// NHIA CLAIM-it XML Serializer
// =====================================================================
// Converts an IntermediateClaimsObject into NHIA CLAIM-it XML.
// This serializer knows NOTHING about Prisma/database models.
// It only works with the ICO interface.
// =====================================================================

import type { IntermediateClaimsObject } from "../types/claims";
import { NHIA_XML_TAGS as T, NHIA_XML_CONFIG as C } from "../config/tags";
import {
  escapeXml, formatDateNHIA, formatDateTimeNHIA, formatAmountNHIA,
  xmlElement, xmlOpen, xmlClose,
} from "../utils/xml";

export function serializeNHIAClaim(ico: IntermediateClaimsObject): string {
  const lines: string[] = [];

  // XML declaration
  lines.push(`<?xml version="${C.VERSION}" encoding="${C.ENCODING}" standalone="${C.STANDALONE}"?>`);

  // Root element
  lines.push(`<${T.ROOT} schemaVersion="${C.ROOT_ATTRIBUTE_SCHEMA_VERSION}">`);

  // --- Claim wrapper ---
  lines.push(xmlOpen(T.CLAIM, 1));

  // --- Header ---
  lines.push(xmlOpen(T.HEADER, 2));
  lines.push(xmlElement(T.CLAIM_BATCH_REF, ico.header.claimBatchRef, 3));
  lines.push(xmlElement(T.CLAIM_NUMBER, ico.header.claimNumber, 3));
  lines.push(xmlElement(T.SUBMISSION_PERIOD, ico.header.submissionPeriod, 3));
  lines.push(xmlElement(T.GENERATED_AT, formatDateTimeNHIA(ico.header.generatedAt), 3));
  lines.push(xmlElement(T.SCHEMA_VERSION, ico.header.schemaVersion, 3));
  lines.push(xmlElement(T.TRANSACTION_TYPE, ico.header.transactionType, 3));
  lines.push(xmlElement(T.CURRENCY, ico.header.currency, 3));
  lines.push(xmlElement(T.FACILITY_CODE, ico.header.facilityCode, 3));
  if (ico.header.providerId) lines.push(xmlElement(T.PROVIDER_ID, ico.header.providerId, 3));
  lines.push(xmlClose(T.HEADER, 2));

  // --- Facility ---
  lines.push(xmlOpen(T.FACILITY, 2));
  lines.push(xmlElement(T.FACILITY_ID, ico.facility.facilityId, 3));
  lines.push(xmlElement(T.FACILITY_CODE, ico.facility.facilityCode, 3));
  lines.push(xmlElement(T.FACILITY_NAME, ico.facility.facilityName, 3));
  if (ico.facility.hpn) lines.push(xmlElement(T.HPN, ico.facility.hpn, 3));
  if (ico.facility.region) lines.push(xmlElement(T.REGION, ico.facility.region, 3));
  if (ico.facility.district) lines.push(xmlElement(T.DISTRICT, ico.facility.district, 3));
  if (ico.facility.facilityType) lines.push(xmlElement(T.FACILITY_TYPE, ico.facility.facilityType, 3));
  if (ico.facility.ownership) lines.push(xmlElement(T.OWNERSHIP, ico.facility.ownership, 3));
  lines.push(xmlClose(T.FACILITY, 2));

  // --- Patient ---
  lines.push(xmlOpen(T.PATIENT, 2));
  lines.push(xmlElement(T.PATIENT_ID, ico.patient.internalPatientId, 3));
  if (ico.patient.patientNumber) lines.push(xmlElement(T.PATIENT_NUMBER, ico.patient.patientNumber, 3));
  if (ico.patient.nhisNumber) lines.push(xmlElement(T.MEMBER_NUMBER, ico.patient.nhisNumber, 3));
  if (ico.patient.ghanaCardPin) lines.push(xmlElement(T.GHANA_CARD_PIN, ico.patient.ghanaCardPin, 3));
  if (ico.patient.cardSerialNumber) lines.push(xmlElement(T.CARD_SERIAL_NUMBER, ico.patient.cardSerialNumber, 3));
  lines.push(xmlElement(T.SURNAME, ico.patient.surname, 3));
  lines.push(xmlElement(T.OTHER_NAMES, ico.patient.otherNames, 3));
  if (ico.patient.dateOfBirth) lines.push(xmlElement(T.DATE_OF_BIRTH, formatDateNHIA(ico.patient.dateOfBirth), 3));
  if (ico.patient.sex) lines.push(xmlElement(T.SEX, ico.patient.sex, 3));
  if (ico.patient.phone) lines.push(xmlElement(T.PHONE, ico.patient.phone, 3));
  if (ico.patient.insuranceProvider) lines.push(xmlElement(T.INSURANCE_PROVIDER, ico.patient.insuranceProvider, 3));
  if (ico.patient.insuranceMembershipStatus) lines.push(xmlElement(T.INSURANCE_MEMBERSHIP_STATUS, ico.patient.insuranceMembershipStatus, 3));
  if (ico.patient.nhisEligibilityStatus) lines.push(xmlElement(T.NHIS_ELIGIBILITY_STATUS, ico.patient.nhisEligibilityStatus, 3));
  lines.push(xmlClose(T.PATIENT, 2));

  // --- Encounter ---
  lines.push(xmlOpen(T.ENCOUNTER, 2));
  lines.push(xmlElement(T.ENCOUNTER_ID, ico.encounter.encounterId, 3));
  lines.push(xmlElement(T.ENCOUNTER_NUMBER, ico.encounter.encounterNumber, 3));
  lines.push(xmlElement(T.VISIT_DATE, formatDateNHIA(ico.encounter.visitDate), 3));
  if (ico.encounter.arrivalTime) lines.push(xmlElement(T.ARRIVAL_TIME, formatDateTimeNHIA(ico.encounter.arrivalTime), 3));
  lines.push(xmlElement(T.ENCOUNTER_TYPE, ico.encounter.encounterType, 3));
  lines.push(xmlElement(T.OPD_IPD_STATUS, ico.encounter.opdIpdStatus, 3));
  if (ico.encounter.department) lines.push(xmlElement(T.DEPARTMENT, ico.encounter.department, 3));
  if (ico.encounter.specialty) lines.push(xmlElement(T.SPECIALTY, ico.encounter.specialty, 3));
  if (ico.encounter.attendingProvider) lines.push(xmlElement(T.ATTENDING_PROVIDER, ico.encounter.attendingProvider, 3));
  if (ico.encounter.admissionDate) lines.push(xmlElement(T.ADMISSION_DATE, formatDateNHIA(ico.encounter.admissionDate), 3));
  if (ico.encounter.dischargeDate) lines.push(xmlElement(T.DISCHARGE_DATE, formatDateNHIA(ico.encounter.dischargeDate), 3));

  // Referral (inside Encounter)
  if (ico.encounter.referralInfo) {
    const r = ico.encounter.referralInfo;
    lines.push(xmlOpen(T.REFERRAL, 3));
    if (r.referringFacilityName) lines.push(xmlElement(T.REFERRING_FACILITY_NAME, r.referringFacilityName, 4));
    if (r.referringFacilityCode) lines.push(xmlElement(T.REFERRING_FACILITY_CODE, r.referringFacilityCode, 4));
    if (r.referringFacilityCCC) lines.push(xmlElement(T.REFERRING_FACILITY_CCC, r.referringFacilityCCC, 4));
    if (r.referralDate) lines.push(xmlElement(T.REFERRAL_DATE, formatDateNHIA(r.referralDate), 4));
    if (r.referralReason) lines.push(xmlElement(T.REFERRAL_REASON, r.referralReason, 4));
    lines.push(xmlClose(T.REFERRAL, 3));
  }
  lines.push(xmlClose(T.ENCOUNTER, 2));

  // --- Attendance Verification ---
  lines.push(xmlOpen(T.ATTENDANCE_VERIFICATION, 2));
  lines.push(xmlElement(T.ATTENDANCE_METHOD, ico.attendanceVerification.method, 3));
  if (ico.attendanceVerification.code) lines.push(xmlElement(T.ATTENDANCE_CODE, ico.attendanceVerification.code, 3));
  if (ico.attendanceVerification.verifiedAt) lines.push(xmlElement(T.VERIFIED_AT, formatDateTimeNHIA(ico.attendanceVerification.verifiedAt), 3));
  lines.push(xmlElement(T.VERIFICATION_STATUS, ico.attendanceVerification.verificationStatus, 3));
  if (ico.attendanceVerification.source) lines.push(xmlElement(T.VERIFICATION_SOURCE, ico.attendanceVerification.source, 3));
  lines.push(xmlClose(T.ATTENDANCE_VERIFICATION, 2));

  // --- Diagnoses ---
  lines.push(xmlOpen(T.DIAGNOSES, 2));
  for (const dx of ico.diagnoses) {
    lines.push(xmlOpen(T.DIAGNOSIS, 3));
    lines.push(xmlElement(T.DIAGNOSIS_CODE, dx.diagnosisCode, 4));
    lines.push(xmlElement(T.DIAGNOSIS_DESCRIPTION, dx.diagnosisDescription, 4));
    lines.push(xmlElement(T.DIAGNOSIS_TYPE, dx.diagnosisType, 4));
    lines.push(xmlElement(T.CODING_SYSTEM, dx.codingSystem, 4));
    if (dx.gdrgCode) lines.push(xmlElement(T.GDRG_CODE, dx.gdrgCode, 4));
    if (dx.gdrgName) lines.push(xmlElement(T.GDRG_NAME, dx.gdrgName, 4));
    lines.push(xmlElement(T.IS_PRIMARY, dx.isPrimary ? "true" : "false", 4));
    lines.push(xmlClose(T.DIAGNOSIS, 3));
  }
  lines.push(xmlClose(T.DIAGNOSES, 2));

  // --- Services (independent from drugs) ---
  lines.push(xmlOpen(T.SERVICES, 2));
  for (const svc of ico.services) {
    lines.push(xmlOpen(T.SERVICE, 3));
    lines.push(xmlElement(T.SERVICE_ITEM_ID, svc.internalItemId, 4));
    if (svc.nhisTariffCode) lines.push(xmlElement(T.NHIS_TARIFF_CODE, svc.nhisTariffCode, 4));
    if (svc.serviceCode) lines.push(xmlElement(T.SERVICE_CODE, svc.serviceCode, 4));
    lines.push(xmlElement(T.SERVICE_DESCRIPTION, svc.serviceDescription, 4));
    lines.push(xmlElement(T.SERVICE_QUANTITY, String(svc.quantity), 4));
    lines.push(xmlElement(T.SERVICE_UNIT_PRICE, formatAmountNHIA(svc.unitPrice), 4));
    if (svc.approvedTariffPrice !== null) lines.push(xmlElement(T.SERVICE_APPROVED_PRICE, formatAmountNHIA(svc.approvedTariffPrice), 4));
    lines.push(xmlElement(T.SERVICE_TOTAL, formatAmountNHIA(svc.totalAmount), 4));
    lines.push(xmlElement(T.SERVICE_DATE, formatDateNHIA(svc.serviceDate), 4));
    if (svc.department) lines.push(xmlElement(T.SERVICE_DEPARTMENT, svc.department, 4));
    if (svc.provider) lines.push(xmlElement(T.SERVICE_PROVIDER, svc.provider, 4));
    lines.push(xmlElement(T.SERVICE_STATUS, svc.itemStatus, 4));
    if (svc.gdrgCode) lines.push(xmlElement(T.SERVICE_GDRG_CODE, svc.gdrgCode, 4));
    if (svc.gdrgName) lines.push(xmlElement(T.SERVICE_GDRG_NAME, svc.gdrgName, 4));
    lines.push(xmlElement(T.SERVICE_CATEGORY, svc.serviceCategory, 4));
    lines.push(xmlClose(T.SERVICE, 3));
  }
  lines.push(xmlClose(T.SERVICES, 2));

  // --- Drugs (independent from services) ---
  lines.push(xmlOpen(T.DRUGS, 2));
  for (const drug of ico.drugs) {
    lines.push(xmlOpen(T.DRUG, 3));
    lines.push(xmlElement(T.DRUG_ITEM_ID, drug.internalItemId, 4));
    if (drug.nhisMedicineCode) lines.push(xmlElement(T.NHIS_MEDICINE_CODE, drug.nhisMedicineCode, 4));
    if (drug.gndlCode) lines.push(xmlElement(T.GNDL_CODE, drug.gndlCode, 4));
    lines.push(xmlElement(T.MEDICINE_NAME, drug.medicineName, 4));
    if (drug.strength) lines.push(xmlElement(T.MEDICINE_STRENGTH, drug.strength, 4));
    if (drug.formulation) lines.push(xmlElement(T.MEDICINE_FORMULATION, drug.formulation, 4));
    lines.push(xmlElement(T.DRUG_QUANTITY, String(drug.quantity), 4));
    if (drug.unit) lines.push(xmlElement(T.DRUG_UNIT, drug.unit, 4));
    lines.push(xmlElement(T.DRUG_UNIT_PRICE, formatAmountNHIA(drug.unitPrice), 4));
    if (drug.approvedNhisPrice !== null) lines.push(xmlElement(T.DRUG_APPROVED_PRICE, formatAmountNHIA(drug.approvedNhisPrice), 4));
    lines.push(xmlElement(T.DRUG_TOTAL, formatAmountNHIA(drug.totalAmount), 4));
    lines.push(xmlElement(T.DISPENSING_DATE, formatDateNHIA(drug.dispensingDate), 4));
    if (drug.prescription) lines.push(xmlElement(T.PRESCRIPTION, drug.prescription, 4));
    if (drug.prescriberId) lines.push(xmlElement(T.PRESCRIBER_ID, drug.prescriberId, 4));
    if (drug.pharmacistId) lines.push(xmlElement(T.PHARMACIST_ID, drug.pharmacistId, 4));
    lines.push(xmlElement(T.DRUG_STATUS, drug.itemStatus, 4));
    lines.push(xmlClose(T.DRUG, 3));
  }
  lines.push(xmlClose(T.DRUGS, 2));

  // --- Totals ---
  lines.push(xmlOpen(T.TOTALS, 2));
  lines.push(xmlElement(T.TOTAL_SERVICE_AMOUNT, formatAmountNHIA(ico.totals.totalServiceAmount), 3));
  lines.push(xmlElement(T.TOTAL_DRUG_AMOUNT, formatAmountNHIA(ico.totals.totalDrugAmount), 3));
  lines.push(xmlElement(T.GROSS_AMOUNT, formatAmountNHIA(ico.totals.grossAmount), 3));
  lines.push(xmlElement(T.TOTAL_DEDUCTIONS, formatAmountNHIA(ico.totals.totalDeductions), 3));
  lines.push(xmlElement(T.PATIENT_AMOUNT, formatAmountNHIA(ico.totals.patientAmount), 3));
  lines.push(xmlElement(T.NHIS_AMOUNT, formatAmountNHIA(ico.totals.nhisAmount), 3));
  lines.push(xmlElement(T.NET_AMOUNT, formatAmountNHIA(ico.totals.netAmount), 3));
  lines.push(xmlClose(T.TOTALS, 2));

  // --- Metadata ---
  lines.push(xmlOpen(T.METADATA, 2));
  lines.push(xmlElement(T.SOURCE_SYSTEM, ico.metadata.sourceSystem, 3));
  lines.push(xmlElement(T.SOURCE_VERSION, ico.metadata.sourceVersion, 3));
  if (ico.metadata.tariffScheduleVersion) lines.push(xmlElement(T.TARIFF_SCHEDULE_VERSION, ico.metadata.tariffScheduleVersion, 3));
  if (ico.metadata.medicinePriceVersion) lines.push(xmlElement(T.MEDICINE_PRICE_VERSION, ico.metadata.medicinePriceVersion, 3));
  if (ico.metadata.baseDataVersion) lines.push(xmlElement(T.BASE_DATA_VERSION, ico.metadata.baseDataVersion, 3));
  lines.push(xmlClose(T.METADATA, 2));

  // Close claim and root
  lines.push(xmlClose(T.CLAIM, 1));
  lines.push(`</${T.ROOT}>`);

  return lines.join("\n");
}
