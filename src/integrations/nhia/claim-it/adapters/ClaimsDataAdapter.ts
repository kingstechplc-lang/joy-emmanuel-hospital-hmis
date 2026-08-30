// =====================================================================
// NHIA Claims Data Adapter — Database → ICO mapping
// =====================================================================
// This adapter queries the HMIS database and maps the results to an
// IntermediateClaimsObject. It is the ONLY layer that touches Prisma.
// =====================================================================

import { db } from "@/lib/db";
import type {
  IntermediateClaimsObject, ICOHeader, ICOFacility, ICOPatient,
  ICOEncounter, AttendanceVerification, ICODiagnosis, ICOServiceItem,
  ICODrugItem, ICOTotals, ICOMetadata, ICOReferral,
} from "../types/claims";
import { generateClaimRef, generateBatchRef, normalizeMemberNumber } from "../utils/xml";

export async function buildICOFromEncounter(
  encounterId: string,
  organizationId: string,
): Promise<{ ico: IntermediateClaimsObject; warnings: string[] }> {
  const warnings: string[] = [];

  // Fetch encounter
  const encounter = await db.encounter.findUnique({
    where: { id: encounterId },
    include: {
      facility: true,
      department: true,
    },
  });

  if (!encounter) throw new Error(`Encounter ${encounterId} not found`);
  if (encounter.facility.organizationId !== organizationId) {
    throw new Error("Encounter does not belong to this organization");
  }

  // Fetch patient with insurance and identifiers
  const patient = await db.patient.findUnique({
    where: { id: encounter.patientId },
    include: {
      insurance: { include: { insuranceProvider: true }, orderBy: { createdAt: "desc" }, take: 1 },
      identifiers: { where: { OR: [{ identifierType: "ghana_card" }, { identifierType: "insurance_number" }] } },
    },
  });
  if (!patient) throw new Error("Patient not found");

  // Fetch diagnoses with catalog
  const diagnoses = await db.diagnosis.findMany({
    where: { encounterId },
    include: { catalog: true },
    orderBy: [{ isPrimary: "desc" }, { diagnosedAt: "asc" }],
  });

  // Fetch NHIS invoice with items
  const invoice = await db.invoice.findFirst({
    where: { encounterId, status: { in: ["issued", "paid", "partially_paid"] }, payerType: "nhis" },
    include: { items: { include: { service: true } } },
    orderBy: { issuedAt: "desc" },
  });

  // Fetch prescriptions with items and medications
  const prescriptions = await db.prescription.findMany({
    where: { encounterId },
    include: {
      items: { include: { medication: true }, where: { dispensedQuantity: { gt: 0 } } },
      prescriber: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // Fetch procedures
  const procedures = await db.procedure.findMany({
    where: { encounterId },
    include: { performedBy: { select: { id: true, firstName: true, lastName: true } } },
  });

  // Fetch referrals
  const referral = await db.referral.findFirst({
    where: { encounterId },
    include: { referringFacility: { select: { id: true, name: true, code: true } } },
  });

  // Fetch admission
  const admission = await db.admission.findFirst({ where: { encounterId } }).catch(() => null);

  // Fetch insurance claims
  const insuranceClaims = invoice ? await db.insuranceClaim.findMany({
    where: { invoiceId: invoice.id },
    take: 1,
  }) : [];

  // --- UPSTREAM NHIS WORKFLOW DATA (Phase 9 integration) ---
  // Pull real attendance verification, encounter coverage, and latest eligibility
  // from the new upstream tables. Falls back gracefully if records don't exist
  // (e.g., encounters created before the upstream workflow was deployed).

  // Encounter-level coverage — authoritative source of payer for this encounter
  const encounterCoverage = await db.encounterCoverage.findFirst({
    where: { encounterId, status: "active" },
    orderBy: { selectedAt: "desc" },
  }).catch(() => null);

  // Attendance verification (CCC/OTAC) — encounter-scoped
  const attendanceRecord = await db.attendanceVerification.findUnique({
    where: { encounterId },
  }).catch(() => null);

  // Latest eligibility verification for this encounter (or fall back to patient-level)
  const eligibilityRecord = await db.eligibilityVerification.findFirst({
    where: {
      OR: [
        { encounterId },
        { patientId: encounter.patientId },
      ],
    },
    orderBy: { verificationDate: "desc" },
  }).catch(() => null);

  // If encounter coverage exists, use its patientInsuranceId to fetch the right PatientInsurance
  // (instead of just grabbing the patient's most recent insurance record)
  const coveragePatientInsuranceId = encounterCoverage?.patientInsuranceId;
  const coveragePatientInsurance = coveragePatientInsuranceId
    ? await db.patientInsurance.findUnique({
        where: { id: coveragePatientInsuranceId },
        include: { insuranceProvider: true },
      }).catch(() => null)
    : null;

  // Resolve NHIS number — prefer encounter-coverage-linked PatientInsurance,
  // fall back to most recent patient insurance, then invoice, then identifier
  const nhisInsurance = coveragePatientInsurance || patient.insurance?.[0];
  const nhisNumber = nhisInsurance?.membershipNumber || invoice?.nhisNumber ||
    patient.identifiers?.find(i => i.identifierType === "insurance_number")?.identifierValue || null;
  const ghanaCardPin = patient.identifiers?.find(i => i.identifierType === "ghana_card")?.identifierValue || null;

  // --- Build ICO ---
  const facility = encounter.facility;
  const claimNumber = generateClaimRef(facility.code, encounterId, encounter.startAt);
  const submissionPeriod = encounter.startAt.toISOString().slice(0, 7);

  const header: ICOHeader = {
    claimBatchRef: generateBatchRef(facility.code, submissionPeriod),
    claimNumber, submissionPeriod,
    generatedAt: new Date(), schemaVersion: "2.0",
    transactionType: "NEW", currency: "GHS",
    facilityCode: facility.code, providerId: null,
  };

  const icoFacility: ICOFacility = {
    facilityId: facility.id, facilityCode: facility.code, facilityName: facility.name,
    hpn: null, region: facility.region, district: null, facilityType: facility.facilityType, ownership: null,
  };

  const icoPatient: ICOPatient = {
    internalPatientId: patient.id, patientNumber: patient.patientNumber,
    nhisNumber: normalizeMemberNumber(nhisNumber), ghanaCardPin,
    cardSerialNumber: nhisInsurance?.policyNumber || null,
    surname: patient.lastName,
    otherNames: [patient.firstName, patient.middleName].filter(Boolean).join(" "),
    dateOfBirth: patient.dateOfBirth,
    sex: patient.sex === "male" ? "M" : patient.sex === "female" ? "F" : "U",
    phone: patient.phone,
    insuranceProvider: nhisInsurance?.insuranceProvider?.name || "NHIS",
    insuranceMembershipStatus: nhisInsurance?.status || null,
    nhisEligibilityStatus: nhisInsurance?.verificationStatus || null,
  };

  const encounterTypeMap: Record<string, any> = {
    opd: "OPD", emergency: "EMERGENCY", inpatient: "IPD", follow_up: "OPD",
    laboratory: "LAB", pharmacy: "PHARMACY", imaging: "OTHER",
    procedure: "OTHER", maternity: "OTHER", other: "OTHER",
  };

  const opdIpdStatus = encounter.encounterType === "inpatient" ? "IPD" : "OPD";

  const referralInfo: ICOReferral | null = referral ? {
    referringFacilityName: referral.referringFacility?.name || null,
    referringFacilityCode: referral.referringFacility?.code || null,
    referringFacilityCCC: null, referralDate: referral.referredAt, referralReason: referral.reason,
  } : null;

  const icoEncounter: ICOEncounter = {
    encounterId: encounter.id, encounterNumber: encounter.encounterNumber,
    visitDate: encounter.startAt, arrivalTime: encounter.startAt,
    encounterType: encounterTypeMap[encounter.encounterType] || "OTHER",
    opdIpdStatus, department: encounter.department?.name || null,
    specialty: null, attendingProvider: null, // attendingStaffId is plain FK, no relation
    admissionDate: admission?.admittedAt || null,
    dischargeDate: admission?.dischargedAt || null,
    referralInfo,
  };

  // --- Attendance Verification (Phase 9 — uses real upstream data) ---
  // Map the AttendanceVerification DB record to the ICO type.
  // If no record exists, fall back to "NOT_REQUIRED" (legacy behaviour for
  // encounters created before the upstream workflow was deployed).
  const attendanceVerification: AttendanceVerification = attendanceRecord
    ? {
        method: attendanceRecord.method as any,
        code: attendanceRecord.code,
        verifiedAt: attendanceRecord.verifiedAt,
        verificationStatus: attendanceRecord.verificationStatus.toUpperCase() as any,
        source: attendanceRecord.source,
        transactionRef: attendanceRecord.transactionRef,
      }
    : {
        method: "CCC",
        code: null,
        verifiedAt: null,
        verificationStatus: "NOT_REQUIRED",
        source: "HMIS",
        transactionRef: null,
      };

  // Diagnoses
  const icoDiagnoses: ICODiagnosis[] = diagnoses.map(d => ({
    diagnosisCode: d.diagnosisCode || d.catalog?.code || "",
    diagnosisDescription: d.diagnosisName,
    diagnosisType: (d.diagnosisType?.toUpperCase() as any) || "PRIMARY",
    codingSystem: d.codeSystem || "ICD-10",
    gdrgCode: d.catalog?.nhisGdrgCode || null,
    gdrgName: d.catalog?.nhisGdrgName || null,
    isPrimary: d.isPrimary,
  }));

  // Services and Drugs from invoice items
  const services: ICOServiceItem[] = [];
  const drugs: ICODrugItem[] = [];

  if (invoice?.items) {
    for (const item of invoice.items) {
      const isDrug = item.referenceType === "prescription" || item.service?.category === "pharmacy";

      if (isDrug) {
        const medItem = prescriptions.flatMap(p => p.items).find(pi => pi.medicationId === item.serviceId);
        const med = medItem?.medication;

        drugs.push({
          internalItemId: item.id,
          nhisMedicineCode: med?.nhisCode || null,
          gndlCode: null,
          medicineName: med ? `${med.genericName} ${med.brandName || ""}`.trim() : item.description,
          strength: med ? `${med.strength || ""} ${med.strengthUnit || ""}`.trim() : null,
          formulation: med?.dosageForm || null,
          quantity: item.quantity,
          unit: med?.unit || null,
          unitPrice: item.unitPrice,
          approvedNhisPrice: med?.nhisTariffAmount || null,
          totalAmount: item.total,
          dispensingDate: invoice.issuedAt || encounter.startAt,
          prescription: medItem ? `${medItem.dose || ""} x ${medItem.frequency || ""} x ${medItem.duration || ""}`.trim() : null,
          prescriberId: prescriptions[0]?.prescriberId || null,
          pharmacistId: null,
          itemStatus: "ACTIVE",
        });
      } else {
        const svc = item.service;
        const proc = procedures.find(p => p.serviceId === item.serviceId);

        services.push({
          internalItemId: item.id,
          nhisTariffCode: svc?.nhisServiceCode || null,
          serviceCode: svc?.code || null,
          serviceDescription: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          approvedTariffPrice: svc?.nhisPrice || null,
          totalAmount: item.total,
          serviceDate: proc?.performedAt || invoice.issuedAt || encounter.startAt,
          department: encounter.department?.name || null,
          provider: proc?.performedBy ? `${proc.performedBy.firstName} ${proc.performedBy.lastName}` : null,
          itemStatus: "ACTIVE",
          gdrgCode: null, // Procedure has no catalog relation
          gdrgName: null,
          serviceCategory: (svc?.category?.toUpperCase() as any) || "OTHER",
        });
      }
    }
  }

  // Totals
  const totalServiceAmount = services.reduce((s, x) => s + x.totalAmount, 0);
  const totalDrugAmount = drugs.reduce((s, x) => s + x.totalAmount, 0);
  const grossAmount = totalServiceAmount + totalDrugAmount;

  const totals: ICOTotals = {
    totalServiceAmount, totalDrugAmount, grossAmount,
    totalDeductions: 0,
    patientAmount: invoice?.patientResponsibility || 0,
    nhisAmount: invoice?.nhisResponsibility || grossAmount,
    netAmount: grossAmount,
  };

  const metadata: ICOMetadata = {
    sourceSystem: "JEM-HMIS", sourceVersion: "1.0",
    tariffScheduleVersion: null, medicinePriceVersion: null, baseDataVersion: null,
    encounterId: encounter.id,
    invoiceId: invoice?.id || null,
    insuranceClaimId: insuranceClaims[0]?.id || null,
  };

  // Warnings — distinguish "missing upstream data" from "missing schema field"
  if (!nhisNumber) warnings.push("Patient NHIS number not found.");
  if (!facility.region) warnings.push("Facility region not configured.");
  if (icoDiagnoses.length === 0) warnings.push("No diagnoses found.");
  if (services.length === 0 && drugs.length === 0) warnings.push("No billable items found.");

  // Attendance verification warnings — context-aware
  if (!attendanceRecord) {
    warnings.push("No attendance verification record for this encounter — using NOT_REQUIRED fallback. Capture CCC/OTAC code via Records Desk for NHIS claims.");
  } else if (attendanceRecord.verificationStatus !== "verified" && attendanceRecord.verificationStatus !== "not_required") {
    warnings.push(`Attendance verification status is '${attendanceRecord.verificationStatus}' (method: ${attendanceRecord.method}). Claim may be rejected.`);
  } else if (attendanceRecord.verificationStatus === "verified" && !attendanceRecord.code && attendanceRecord.method !== "NOT_REQUIRED") {
    warnings.push("Attendance marked verified but no code captured — claim may be rejected.");
  }

  // Encounter coverage warning
  if (!encounterCoverage) {
    warnings.push("No encounter coverage record found — payer inferred from invoice. Use Records Desk to explicitly select encounter payer for accurate claim preparation.");
  } else if (encounterCoverage.payerType === "nhis" && !encounterCoverage.patientInsuranceId) {
    warnings.push("Encounter coverage is NHIS but no PatientInsurance linked — claim may be rejected.");
  }

  // Eligibility verification warning
  if (encounterCoverage?.payerType === "nhis") {
    if (!eligibilityRecord) {
      warnings.push("No eligibility verification record found — claim may be rejected without verified eligibility.");
    } else if (eligibilityRecord.verificationStatus === "pending") {
      warnings.push("Eligibility verification is still pending.");
    } else if (eligibilityRecord.verificationStatus === "failed" || eligibilityRecord.verificationStatus === "unable_to_verify") {
      warnings.push(`Eligibility verification ${eligibilityRecord.verificationStatus} — claim will likely be rejected.`);
    } else if (eligibilityRecord.expiresAt && new Date(eligibilityRecord.expiresAt) < new Date()) {
      warnings.push("Eligibility verification has expired — re-verify before submitting claim.");
    }
  }

  return {
    ico: {
      header, facility: icoFacility, patient: icoPatient,
      encounter: icoEncounter, attendanceVerification,
      diagnoses: icoDiagnoses, services, drugs, totals, metadata,
    },
    warnings,
  };
}
