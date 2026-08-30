// =====================================================================
// Claim Readiness Engine
// =====================================================================
// Pure-function engine that evaluates whether an encounter is ready for
// claim submission. Produces a structured checklist with actionable
// failure explanations (section 27 of the master prompt).
//
// This engine NEVER queries the database directly — it accepts a
// preloaded EncounterReadinessContext (gathered by the API route).
// This makes it unit-testable without a DB.
// =====================================================================

export type CheckSeverity = "ERROR" | "WARNING" | "INFO";
export type CheckStatus = "PASS" | "FAIL" | "WARNING" | "SKIP";

export interface ReadinessCheck {
  checkId: string;
  label: string;
  status: CheckStatus;
  severity: CheckSeverity;
  message: string;
  source?: string; // which HMIS module owns this check
  remediationHint?: string;
}

export interface ReadinessContext {
  encounter: {
    id: string;
    encounterNumber: string;
    encounterType: string;
    startAt: Date;
    status: string;
    patientId: string;
    facilityId: string;
  };
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date | null;
    sex: string | null;
    phone: string | null;
  } | null;
  patientInsurance: {
    id: string;
    membershipNumber: string | null;
    policyNumber: string | null;
    status: string;
    verificationStatus: string;
    coverageEnd: Date | null;
    insuranceProvider: { id: string; name: string; code: string; providerType: string };
  } | null;
  encounterCoverage: {
    id: string;
    payerType: string;
    status: string;
    patientInsuranceId: string | null;
    insuranceProviderId: string | null;
  } | null;
  latestEligibility: {
    id: string;
    verificationStatus: string;
    verificationMethod: string;
    verificationSource: string;
    coverageEnd: Date | null;
    expiresAt: Date | null;
    verificationDate: Date;
  } | null;
  attendanceVerification: {
    id: string;
    method: string;
    code: string | null;
    verificationStatus: string;
    verifiedAt: Date | null;
    expiresAt: Date | null;
  } | null;
  diagnoses: Array<{
    id: string;
    diagnosisCode: string | null;
    diagnosisName: string;
    isPrimary: boolean;
    codeSystem: string | null;
  }>;
  services: Array<{
    id: string;
    name: string;
    code: string;
    nhisServiceCode: string | null;
    nhisPrice: number | null;
    nhisEligible: boolean;
  }>;
  medications: Array<{
    id: string;
    genericName: string;
    nhisCode: string | null;
    nhisTariffAmount: number | null;
  }>;
  invoice: {
    id: string;
    invoiceNumber: string;
    payerType: string;
    status: string;
    total: number;
    balance: number;
    nhisResponsibility: number;
    patientResponsibility: number;
  } | null;
  insuranceClaim: {
    id: string;
    claimNumber: string;
    status: string;
    isNhisValidated: boolean;
  } | null;
}

export interface ReadinessResult {
  status: "not_ready" | "ready_for_validation" | "validation_failed" | "ready_for_export" | "exported";
  readinessScore: number; // 0-100
  checksTotal: number;
  checksPassed: number;
  checksFailed: number;
  checksWarning: number;
  checks: ReadinessCheck[];
  failureSummary: string;
  warningsSummary: string;
  // Link IDs for persistence
  coverageId: string | null;
  eligibilityVerificationId: string | null;
  attendanceVerificationId: string | null;
  invoiceId: string | null;
  insuranceClaimId: string | null;
}

// --- Individual check functions ---

function checkPatientIdentified(ctx: ReadinessContext): ReadinessCheck {
  const ok = !!ctx.patient && !!ctx.patient.firstName && !!ctx.patient.lastName;
  return {
    checkId: "patient_identified",
    label: "Patient identified",
    status: ok ? "PASS" : "FAIL",
    severity: "ERROR",
    message: ok
      ? `Patient: ${ctx.patient!.firstName} ${ctx.patient!.lastName}`
      : "Patient record missing or incomplete",
    source: "Patient Master Index",
    remediationHint: ok ? undefined : "Open Patient Registration and complete the patient record.",
  };
}

function checkCorrectEncounter(ctx: ReadinessContext): ReadinessCheck {
  const e = ctx.encounter;
  const ok = !!e.encounterNumber && !!e.patientId && !!e.facilityId;
  return {
    checkId: "correct_encounter",
    label: "Correct encounter selected",
    status: ok ? "PASS" : "FAIL",
    severity: "ERROR",
    message: ok
      ? `Encounter ${e.encounterNumber} (${e.encounterType}) on ${new Date(e.startAt).toLocaleDateString()}`
      : "Encounter record incomplete",
    source: "Encounters",
    remediationHint: ok ? undefined : "Reopen the encounter and verify required fields.",
  };
}

function checkPayerSelected(ctx: ReadinessContext): ReadinessCheck {
  const c = ctx.encounterCoverage;
  const ok = !!c && c.status === "active";
  return {
    checkId: "payer_selected",
    label: "Payer selected for this encounter",
    status: ok ? "PASS" : "FAIL",
    severity: "ERROR",
    message: ok
      ? `Payer: ${c!.payerType.toUpperCase()}`
      : "No active payer/coverage record for this encounter",
    source: "Encounter Coverage",
    remediationHint: ok ? undefined : "Go to Records Desk → select insurance/self-pay for this encounter.",
  };
}

function checkInsuranceInfoPresent(ctx: ReadinessContext): ReadinessCheck {
  const c = ctx.encounterCoverage;
  const isInsurance = c && ["nhis", "private_insurance", "corporate"].includes(c.payerType);
  if (!isInsurance) {
    return {
      checkId: "insurance_info_present",
      label: "Insurance information present",
      status: "SKIP",
      severity: "INFO",
      message: `Not required — payerType is ${c?.payerType || "unknown"}`,
      source: "Patient Insurance",
    };
  }
  const pi = ctx.patientInsurance;
  const ok = !!pi && !!pi.membershipNumber;
  return {
    checkId: "insurance_info_present",
    label: "Insurance information present",
    status: ok ? "PASS" : "FAIL",
    severity: "ERROR",
    message: ok
      ? `Member #: ${pi!.membershipNumber} (${pi!.insuranceProvider.name})`
      : "Insurance payer selected but no PatientInsurance record with membership number",
    source: "Patient Insurance",
    remediationHint: ok ? undefined : "Capture the patient's NHIS/insurance membership number.",
  };
}

function checkEligibilityVerified(ctx: ReadinessContext): ReadinessCheck {
  const c = ctx.encounterCoverage;
  const isInsurance = c && ["nhis", "private_insurance", "corporate"].includes(c.payerType);
  if (!isInsurance) {
    return {
      checkId: "eligibility_verified",
      label: "Eligibility verified",
      status: "SKIP",
      severity: "INFO",
      message: "Not required for non-insurance payer",
      source: "Eligibility Verification",
    };
  }
  const ev = ctx.latestEligibility;
  if (!ev) {
    return {
      checkId: "eligibility_verified",
      label: "Eligibility verified",
      status: "FAIL",
      severity: "ERROR",
      message: "No eligibility verification record found for this encounter",
      source: "Eligibility Verification",
      remediationHint: "Run eligibility verification from Records Desk before claim preparation.",
    };
  }
  // Check expiry
  const now = new Date();
  if (ev.expiresAt && new Date(ev.expiresAt) < now) {
    return {
      checkId: "eligibility_verified",
      label: "Eligibility verified",
      status: "FAIL",
      severity: "ERROR",
      message: `Eligibility verification expired on ${new Date(ev.expiresAt).toLocaleDateString()}`,
      source: "Eligibility Verification",
      remediationHint: "Re-run eligibility verification — the previous result has expired.",
    };
  }
  const okStatuses = ["verified", "active", "manual_verified"];
  if (!okStatuses.includes(ev.verificationStatus)) {
    return {
      checkId: "eligibility_verified",
      label: "Eligibility verified",
      status: "FAIL",
      severity: "ERROR",
      message: `Eligibility verification status: ${ev.verificationStatus} (method: ${ev.verificationMethod}, source: ${ev.verificationSource})`,
      source: "Eligibility Verification",
      remediationHint: "Eligibility must be verified before claim preparation. Re-run or use manual verification if appropriate.",
    };
  }
  // Distinguish official vs manual (section 39 — never lie about source)
  const isOfficial = ev.verificationSource === "nhia_integration";
  return {
    checkId: "eligibility_verified",
    label: "Eligibility verified",
    status: "PASS",
    severity: isOfficial ? "INFO" : "WARNING",
    message: isOfficial
      ? `Officially verified via NHIA integration (ref: ${ev.verificationDate.toISOString()})`
      : `Manually verified (source: ${ev.verificationSource}) — NOT official NHIA verification`,
    source: "Eligibility Verification",
    remediationHint: isOfficial ? undefined : "For official NHIA verification, integrate the NHIA live API.",
  };
}

function checkAttendanceVerified(ctx: ReadinessContext): ReadinessCheck {
  const c = ctx.encounterCoverage;
  const isNhis = c?.payerType === "nhis";
  if (!isNhis) {
    return {
      checkId: "attendance_verified",
      label: "Attendance verified",
      status: "SKIP",
      severity: "INFO",
      message: "Not required for non-NHIS payer",
      source: "Attendance Verification",
    };
  }
  const av = ctx.attendanceVerification;
  if (!av) {
    return {
      checkId: "attendance_verified",
      label: "Attendance verified",
      status: "FAIL",
      severity: "ERROR",
      message: "No attendance verification record found for this encounter",
      source: "Attendance Verification",
      remediationHint: "Capture the patient's CCC/OTAC code from Records Desk.",
    };
  }
  if (av.verificationStatus === "not_required") {
    return {
      checkId: "attendance_verified",
      label: "Attendance verified",
      status: "PASS",
      severity: "INFO",
      message: "Attendance verification marked as NOT_REQUIRED",
      source: "Attendance Verification",
    };
  }
  if (av.verificationStatus === "pending") {
    return {
      checkId: "attendance_verified",
      label: "Attendance verified",
      status: "FAIL",
      severity: "ERROR",
      message: `Attendance verification pending (method: ${av.method}, code captured: ${!!av.code})`,
      source: "Attendance Verification",
      remediationHint: "Mark the attendance verification as verified after confirming the code.",
    };
  }
  if (av.verificationStatus === "failed") {
    return {
      checkId: "attendance_verified",
      label: "Attendance verified",
      status: "FAIL",
      severity: "ERROR",
      message: `Attendance verification failed (method: ${av.method})`,
      source: "Attendance Verification",
      remediationHint: "Re-capture a valid attendance code.",
    };
  }
  if (av.verificationStatus === "expired") {
    return {
      checkId: "attendance_verified",
      label: "Attendance verified",
      status: "FAIL",
      severity: "ERROR",
      message: "Attendance verification code has expired",
      source: "Attendance Verification",
      remediationHint: "Capture a fresh attendance code.",
    };
  }
  if (av.verificationStatus === "verified" && !av.code && av.method !== "NOT_REQUIRED") {
    return {
      checkId: "attendance_verified",
      label: "Attendance verified",
      status: "FAIL",
      severity: "ERROR",
      message: "Attendance marked verified but no code captured",
      source: "Attendance Verification",
      remediationHint: "Capture the actual CCC/OTAC code.",
    };
  }
  return {
    checkId: "attendance_verified",
    label: "Attendance verified",
    status: "PASS",
    severity: "INFO",
    message: `Verified via ${av.method} on ${av.verifiedAt ? new Date(av.verifiedAt).toLocaleDateString() : "unknown date"}`,
    source: "Attendance Verification",
  };
}

function checkDiagnosisPresent(ctx: ReadinessContext): ReadinessCheck {
  if (ctx.diagnoses.length === 0) {
    return {
      checkId: "diagnosis_present",
      label: "Primary diagnosis present",
      status: "FAIL",
      severity: "ERROR",
      message: "No diagnoses recorded for this encounter",
      source: "Diagnosis Engine",
      remediationHint: "Record at least one primary diagnosis (ICD-10) in the encounter.",
    };
  }
  const primary = ctx.diagnoses.find(d => d.isPrimary);
  if (!primary) {
    return {
      checkId: "diagnosis_present",
      label: "Primary diagnosis present",
      status: "FAIL",
      severity: "ERROR",
      message: `${ctx.diagnoses.length} diagnosis(es) recorded, but none marked as primary`,
      source: "Diagnosis Engine",
      remediationHint: "Mark one diagnosis as primary.",
    };
  }
  if (!primary.diagnosisCode) {
    return {
      checkId: "diagnosis_present",
      label: "Primary diagnosis present",
      status: "FAIL",
      severity: "ERROR",
      message: `Primary diagnosis "${primary.diagnosisName}" has no ICD-10 code`,
      source: "Diagnosis Engine",
      remediationHint: "Link the diagnosis to the ICD-10 catalog.",
    };
  }
  return {
    checkId: "diagnosis_present",
    label: "Primary diagnosis present",
    status: "PASS",
    severity: "INFO",
    message: `${primary.diagnosisCode} — ${primary.diagnosisName} (${ctx.diagnoses.length} total)`,
    source: "Diagnosis Engine",
  };
}

function checkValidClinicalServices(ctx: ReadinessContext): ReadinessCheck {
  if (ctx.services.length === 0) {
    return {
      checkId: "valid_services",
      label: "Valid clinical services",
      status: "WARNING",
      severity: "WARNING",
      message: "No services linked to this encounter",
      source: "Services & Pricing",
      remediationHint: "Add billable services or proceed if none were rendered.",
    };
  }
  const missingCodes = ctx.services.filter(s => !s.nhisServiceCode);
  const isNhis = ctx.encounterCoverage?.payerType === "nhis";
  if (isNhis && missingCodes.length > 0) {
    return {
      checkId: "valid_services",
      label: "Valid clinical services",
      status: "WARNING",
      severity: "WARNING",
      message: `${ctx.services.length} services, ${missingCodes.length} missing NHIS tariff code: ${missingCodes.slice(0, 3).map(s => s.name).join(", ")}${missingCodes.length > 3 ? "..." : ""}`,
      source: "Services & Pricing",
      remediationHint: "Map missing services to NHIS tariff codes in Services & Pricing admin.",
    };
  }
  return {
    checkId: "valid_services",
    label: "Valid clinical services",
    status: "PASS",
    severity: "INFO",
    message: `${ctx.services.length} services, all have NHIS codes`,
    source: "Services & Pricing",
  };
}

function checkValidMedicines(ctx: ReadinessContext): ReadinessCheck {
  if (ctx.medications.length === 0) {
    return {
      checkId: "valid_medicines",
      label: "Valid medicines/dispensing",
      status: "WARNING",
      severity: "WARNING",
      message: "No medications prescribed/dispensed for this encounter",
      source: "Pharmacy",
      remediationHint: "Proceed if no medications were dispensed.",
    };
  }
  const isNhis = ctx.encounterCoverage?.payerType === "nhis";
  const missingCodes = ctx.medications.filter(m => !m.nhisCode);
  if (isNhis && missingCodes.length > 0) {
    return {
      checkId: "valid_medicines",
      label: "Valid medicines/dispensing",
      status: "WARNING",
      severity: "WARNING",
      message: `${ctx.medications.length} medications, ${missingCodes.length} missing NHIS medicine code: ${missingCodes.slice(0, 3).map(m => m.genericName).join(", ")}${missingCodes.length > 3 ? "..." : ""}`,
      source: "Pharmacy",
      remediationHint: "Map missing medications to NHIS medicine codes in Medications admin.",
    };
  }
  return {
    checkId: "valid_medicines",
    label: "Valid medicines/dispensing",
    status: "PASS",
    severity: "INFO",
    message: `${ctx.medications.length} medications, all have NHIS codes`,
    source: "Pharmacy",
  };
}

function checkRequiredCodesAvailable(ctx: ReadinessContext): ReadinessCheck {
  const missing: string[] = [];
  if (!ctx.patient?.dateOfBirth) missing.push("patient DOB");
  if (!ctx.patient?.sex) missing.push("patient sex");

  const isNhis = ctx.encounterCoverage?.payerType === "nhis";
  if (isNhis) {
    if (!ctx.patientInsurance?.membershipNumber) missing.push("NHIS member number");
  }

  if (missing.length === 0) {
    return {
      checkId: "required_codes",
      label: "Required codes available",
      status: "PASS",
      severity: "INFO",
      message: "All required demographic and coding fields present",
      source: "Patient / Insurance",
    };
  }
  return {
    checkId: "required_codes",
    label: "Required codes available",
    status: missing.some(m => m.includes("NHIS")) ? "FAIL" : "WARNING",
    severity: missing.some(m => m.includes("NHIS")) ? "ERROR" : "WARNING",
    message: `Missing: ${missing.join(", ")}`,
    source: "Patient / Insurance",
    remediationHint: "Complete the missing patient/insurance demographic fields.",
  };
}

function checkBillingTotalsConsistent(ctx: ReadinessContext): ReadinessCheck {
  if (!ctx.invoice) {
    return {
      checkId: "billing_totals",
      label: "Financial totals consistent",
      status: "FAIL",
      severity: "ERROR",
      message: "No invoice linked to this encounter",
      source: "Billing",
      remediationHint: "Create an invoice for this encounter before claim preparation.",
    };
  }
  const inv = ctx.invoice;
  if (inv.status === "draft" || inv.status === "pending_review") {
    return {
      checkId: "billing_totals",
      label: "Financial totals consistent",
      status: "FAIL",
      severity: "ERROR",
      message: `Invoice ${inv.invoiceNumber} is in ${inv.status} status — must be issued`,
      source: "Billing",
      remediationHint: "Issue the invoice before claim preparation.",
    };
  }
  if (inv.total <= 0) {
    return {
      checkId: "billing_totals",
      label: "Financial totals consistent",
      status: "FAIL",
      severity: "ERROR",
      message: `Invoice ${inv.invoiceNumber} total is ${inv.total} — must be > 0`,
      source: "Billing",
      remediationHint: "Add line items to the invoice.",
    };
  }
  const isNhis = ctx.encounterCoverage?.payerType === "nhis";
  if (isNhis && inv.payerType !== "nhis") {
    return {
      checkId: "billing_totals",
      label: "Financial totals consistent",
      status: "FAIL",
      severity: "ERROR",
      message: `Encounter coverage is NHIS but invoice payerType is ${inv.payerType}`,
      source: "Billing / Encounter Coverage",
      remediationHint: "Either change the invoice payerType to 'nhis' or change the encounter coverage.",
    };
  }
  return {
    checkId: "billing_totals",
    label: "Financial totals consistent",
    status: "PASS",
    severity: "INFO",
    message: `Invoice ${inv.invoiceNumber}: GHS ${inv.total.toFixed(2)} (NHIS: ${inv.nhisResponsibility.toFixed(2)}, patient: ${inv.patientResponsibility.toFixed(2)})`,
    source: "Billing",
  };
}

function checkClaimInfoAvailable(ctx: ReadinessContext): ReadinessCheck {
  // If an InsuranceClaim already exists and is validated, that's good.
  // If it doesn't exist yet, that's fine — readiness evaluation precedes claim creation.
  if (!ctx.insuranceClaim) {
    return {
      checkId: "claim_info",
      label: "Required claim information available",
      status: "PASS",
      severity: "INFO",
      message: "No insurance claim created yet — readiness evaluation precedes claim creation",
      source: "Insurance Claims",
    };
  }
  const c = ctx.insuranceClaim;
  if (c.status === "rejected") {
    return {
      checkId: "claim_info",
      label: "Required claim information available",
      status: "WARNING",
      severity: "WARNING",
      message: `Existing claim ${c.claimNumber} was REJECTED — resubmission may be needed`,
      source: "Insurance Claims",
      remediationHint: "Review rejection reason and resubmit if appropriate.",
    };
  }
  return {
    checkId: "claim_info",
    label: "Required claim information available",
    status: "PASS",
    severity: "INFO",
    message: `Existing claim ${c.claimNumber} (status: ${c.status}, validated: ${c.isNhisValidated})`,
    source: "Insurance Claims",
  };
}

// --- Main evaluation function ---

export function evaluateReadiness(ctx: ReadinessContext): ReadinessResult {
  const checks: ReadinessCheck[] = [
    checkPatientIdentified(ctx),
    checkCorrectEncounter(ctx),
    checkPayerSelected(ctx),
    checkInsuranceInfoPresent(ctx),
    checkEligibilityVerified(ctx),
    checkAttendanceVerified(ctx),
    checkDiagnosisPresent(ctx),
    checkValidClinicalServices(ctx),
    checkValidMedicines(ctx),
    checkRequiredCodesAvailable(ctx),
    checkBillingTotalsConsistent(ctx),
    checkClaimInfoAvailable(ctx),
  ];

  const checksTotal = checks.length;
  const skipped = checks.filter(c => c.status === "SKIP").length;
  const effectiveTotal = checksTotal - skipped;
  const checksPassed = checks.filter(c => c.status === "PASS").length;
  const checksFailed = checks.filter(c => c.status === "FAIL").length;
  const checksWarning = checks.filter(c => c.status === "WARNING").length;
  const readinessScore = effectiveTotal > 0 ? Math.round((checksPassed / effectiveTotal) * 100) : 0;

  // Determine overall status
  let status: ReadinessResult["status"];
  if (checksFailed === 0 && checksWarning === 0) {
    status = "ready_for_export";
  } else if (checksFailed === 0 && checksWarning > 0) {
    status = "ready_for_validation";
  } else {
    status = "not_ready";
  }

  // If an InsuranceClaim exists and is validated, mark as ready_for_export
  if (ctx.insuranceClaim?.isNhisValidated && checksFailed === 0) {
    status = "ready_for_export";
  }

  // Build failure summary (section 27 — actionable reasons)
  const failures = checks.filter(c => c.status === "FAIL");
  const warnings = checks.filter(c => c.status === "WARNING");
  const failureSummary = failures.length === 0
    ? ""
    : failures.map(f => `✗ ${f.label}: ${f.message}${f.remediationHint ? ` → ${f.remediationHint}` : ""}`).join("\n");
  const warningsSummary = warnings.length === 0
    ? ""
    : warnings.map(w => `⚠ ${w.label}: ${w.message}`).join("\n");

  return {
    status,
    readinessScore,
    checksTotal: effectiveTotal,
    checksPassed,
    checksFailed,
    checksWarning,
    checks,
    failureSummary,
    warningsSummary,
    coverageId: ctx.encounterCoverage?.id || null,
    eligibilityVerificationId: ctx.latestEligibility?.id || null,
    attendanceVerificationId: ctx.attendanceVerification?.id || null,
    invoiceId: ctx.invoice?.id || null,
    insuranceClaimId: ctx.insuranceClaim?.id || null,
  };
}
