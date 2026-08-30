// =====================================================================
// Upstream NHIS Workflow — Claim Readiness Engine Tests
// =====================================================================
// Tests the pure-function readiness engine with synthetic scenarios:
//   1. Fully-ready encounter (all checks pass)
//   2. Missing insurance
//   3. Missing eligibility
//   4. Missing attendance
//   5. Missing diagnosis
//   6. Missing invoice
//   7. NHIS invoice/coverage mismatch
//   8. Eligibility expired
//   9. Attendance pending
//  10. Self-pay encounter (skips insurance/eligibility/attendance checks)
//  11. Manual vs official eligibility verification distinction
//  12. Existing rejected InsuranceClaim
//
// Run: npx tsx scripts/nhia-tests/run-upstream-tests.ts
// =====================================================================
import { evaluateReadiness, type ReadinessContext } from "../../src/lib/nhis-workflow/claim-readiness-engine";

// --- Test framework (mini) ---
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string) {
  if (cond) { passed++; } else {
    failed++;
    failures.push(label);
    console.error(`  ✗ FAIL: ${label}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; } else {
    failed++;
    failures.push(`${label}\n    expected: ${e}\n    actual:   ${a}`);
    console.error(`  ✗ FAIL: ${label}`);
    console.error(`    expected: ${e}`);
    console.error(`    actual:   ${a}`);
  }
}

function describe(name: string, fn: () => void) {
  console.log(`\n▶ ${name}`);
  try { fn(); } catch (e: any) {
    failed++;
    failures.push(`${name} — threw: ${e?.message || e}`);
    console.error(`  ✗ FAIL: threw: ${e?.message || e}`);
  }
}

// --- Helpers: build synthetic contexts ---

function baseEncounter(): ReadinessContext["encounter"] {
  return {
    id: "enc_001", encounterNumber: "ENC-2026-000001",
    encounterType: "opd", startAt: new Date("2026-08-15"),
    status: "completed", patientId: "pat_001", facilityId: "fac_001",
  };
}

function basePatient(): ReadinessContext["patient"] {
  return {
    id: "pat_001", firstName: "Kwabena", lastName: "Mensah",
    dateOfBirth: new Date("1985-04-12"), sex: "male", phone: "+233244567890",
  };
}

function basePatientInsurance(): ReadinessContext["patientInsurance"] {
  return {
    id: "pi_001", membershipNumber: "NHIS1234567890", policyNumber: "POL-001",
    status: "active", verificationStatus: "verified",
    coverageEnd: new Date("2027-12-31"),
    insuranceProvider: {
      id: "prov_001", name: "NHIS", code: "NHIS",
      providerType: "nhis",
    },
  };
}

function baseCoverage(payerType: string = "nhis"): ReadinessContext["encounterCoverage"] {
  return {
    id: "cov_001", payerType, status: "active",
    patientInsuranceId: payerType === "nhis" ? "pi_001" : null,
    insuranceProviderId: payerType === "nhis" ? "prov_001" : null,
  };
}

function baseEligibility(): ReadinessContext["latestEligibility"] {
  return {
    id: "ev_001", verificationStatus: "verified",
    verificationMethod: "manual", verificationSource: "manual",
    coverageEnd: new Date("2027-12-31"),
    expiresAt: new Date("2027-12-31"),
    verificationDate: new Date("2026-08-15"),
  };
}

function baseAttendance(): ReadinessContext["attendanceVerification"] {
  return {
    id: "av_001", method: "CCC", code: "CCC-12345-ABC",
    verificationStatus: "verified", verifiedAt: new Date("2026-08-15"),
    expiresAt: null,
  };
}

function baseDiagnoses(): ReadinessContext["diagnoses"] {
  return [{
    id: "dx_001", diagnosisCode: "I10", diagnosisName: "Essential hypertension",
    isPrimary: true, codeSystem: "ICD-10",
  }];
}

function baseServices(): ReadinessContext["services"] {
  return [{
    id: "svc_001", name: "OPD Consultation", code: "OPD-CONSULT",
    nhisServiceCode: "CONS-001", nhisPrice: 35, nhisEligible: true,
  }];
}

function baseMedications(): ReadinessContext["medications"] {
  return [{
    id: "med_001", genericName: "Amlodipine",
    nhisCode: "AML-5MG", nhisTariffAmount: 0.45,
  }];
}

function baseInvoice(payerType: string = "nhis"): NonNullable<ReadinessContext["invoice"]> {
  return {
    id: "inv_001", invoiceNumber: "INV-2026-000001",
    payerType, status: "issued",
    total: 93, balance: 0,
    nhisResponsibility: 93, patientResponsibility: 0,
  };
}

function buildContext(overrides: Partial<ReadinessContext> = {}): ReadinessContext {
  return {
    encounter: baseEncounter(),
    patient: basePatient(),
    patientInsurance: basePatientInsurance(),
    encounterCoverage: baseCoverage(),
    latestEligibility: baseEligibility(),
    attendanceVerification: baseAttendance(),
    diagnoses: baseDiagnoses(),
    services: baseServices(),
    medications: baseMedications(),
    invoice: baseInvoice(),
    insuranceClaim: null,
    ...overrides,
  };
}

// =====================================================================
// TESTS
// =====================================================================

describe("Engine: fully-ready encounter (NHIS)", () => {
  const ctx = buildContext();
  const result = evaluateReadiness(ctx);
  assertEqual(result.status, "ready_for_export", "status is ready_for_export");
  assertEqual(result.checksFailed, 0, "no failures");
  assertEqual(result.checksWarning, 0, "no warnings");
  assertEqual(result.checksPassed, result.checksTotal, "all checks passed");
  assertEqual(result.readinessScore, 100, "score is 100%");
  assertEqual(result.failureSummary, "", "failure summary is empty");
});

describe("Engine: missing insurance info", () => {
  const ctx = buildContext({
    patientInsurance: null,
    encounterCoverage: { ...baseCoverage(), patientInsuranceId: null },
  });
  const result = evaluateReadiness(ctx);
  assert(result.status === "not_ready", "status is not_ready");
  assert(result.checksFailed >= 1, "at least 1 failure");
  assert(result.failureSummary.includes("Insurance information present"), "failure mentions insurance");
});

describe("Engine: missing eligibility verification", () => {
  const ctx = buildContext({ latestEligibility: null });
  const result = evaluateReadiness(ctx);
  assert(result.status === "not_ready", "status is not_ready");
  assert(result.checks.some(c => c.checkId === "eligibility_verified" && c.status === "FAIL"), "eligibility check failed");
});

describe("Engine: eligibility pending", () => {
  const ctx = buildContext({
    latestEligibility: { ...baseEligibility(), verificationStatus: "pending" },
  });
  const result = evaluateReadiness(ctx);
  assert(result.status === "not_ready", "status is not_ready");
  assert(result.checks.some(c => c.checkId === "eligibility_verified" && c.status === "FAIL"), "eligibility check failed");
});

describe("Engine: eligibility expired", () => {
  const ctx = buildContext({
    latestEligibility: {
      ...baseEligibility(),
      expiresAt: new Date("2020-01-01"), // past
    },
  });
  const result = evaluateReadiness(ctx);
  assert(result.status === "not_ready", "status is not_ready");
  assert(result.checks.some(c => c.checkId === "eligibility_verified" && c.status === "FAIL"), "eligibility check failed");
  assert(result.failureSummary.includes("expired"), "failure mentions expiry");
});

describe("Engine: missing attendance verification", () => {
  const ctx = buildContext({ attendanceVerification: null });
  const result = evaluateReadiness(ctx);
  assert(result.status === "not_ready", "status is not_ready");
  assert(result.checks.some(c => c.checkId === "attendance_verified" && c.status === "FAIL"), "attendance check failed");
});

describe("Engine: attendance pending", () => {
  const ctx = buildContext({
    attendanceVerification: { ...baseAttendance(), verificationStatus: "pending", verifiedAt: null },
  });
  const result = evaluateReadiness(ctx);
  assert(result.status === "not_ready", "status is not_ready");
  assert(result.checks.some(c => c.checkId === "attendance_verified" && c.status === "FAIL"), "attendance check failed");
});

describe("Engine: attendance verified but no code", () => {
  const ctx = buildContext({
    attendanceVerification: { ...baseAttendance(), code: null },
  });
  const result = evaluateReadiness(ctx);
  assert(result.status === "not_ready", "status is not_ready");
  assert(result.checks.some(c => c.checkId === "attendance_verified" && c.status === "FAIL"), "attendance check failed");
});

describe("Engine: attendance not_required (valid for non-NHIS)", () => {
  const ctx = buildContext({
    encounterCoverage: baseCoverage("self_pay"),
    patientInsurance: null,
    latestEligibility: null,
    attendanceVerification: {
      id: "av_001", method: "NOT_REQUIRED", code: null,
      verificationStatus: "not_required", verifiedAt: new Date(),
      expiresAt: null,
    },
    invoice: baseInvoice("self_pay"),
  });
  const result = evaluateReadiness(ctx);
  // For self-pay, insurance/eligibility/attendance checks are all SKIP (not applicable)
  assert(result.checks.find(c => c.checkId === "eligibility_verified")?.status === "SKIP", "eligibility check skipped");
  assert(result.checks.find(c => c.checkId === "attendance_verified")?.status === "SKIP", "attendance check skipped (self-pay)");
  assert(result.checks.find(c => c.checkId === "insurance_info_present")?.status === "SKIP", "insurance check skipped");
});

describe("Engine: missing diagnosis", () => {
  const ctx = buildContext({ diagnoses: [] });
  const result = evaluateReadiness(ctx);
  assert(result.status === "not_ready", "status is not_ready");
  assert(result.checks.some(c => c.checkId === "diagnosis_present" && c.status === "FAIL"), "diagnosis check failed");
});

describe("Engine: diagnosis present but no primary", () => {
  const ctx = buildContext({
    diagnoses: [{ ...baseDiagnoses()[0], isPrimary: false }],
  });
  const result = evaluateReadiness(ctx);
  assert(result.status === "not_ready", "status is not_ready");
  assert(result.checks.some(c => c.checkId === "diagnosis_present" && c.status === "FAIL"), "diagnosis check failed");
  assert(result.failureSummary.includes("none marked as primary"), "failure mentions no primary");
});

describe("Engine: diagnosis without ICD-10 code", () => {
  const ctx = buildContext({
    diagnoses: [{ ...baseDiagnoses()[0], diagnosisCode: null }],
  });
  const result = evaluateReadiness(ctx);
  assert(result.status === "not_ready", "status is not_ready");
  assert(result.checks.some(c => c.checkId === "diagnosis_present" && c.status === "FAIL"), "diagnosis check failed");
});

describe("Engine: missing invoice", () => {
  const ctx = buildContext({ invoice: null });
  const result = evaluateReadiness(ctx);
  assert(result.status === "not_ready", "status is not_ready");
  assert(result.checks.some(c => c.checkId === "billing_totals" && c.status === "FAIL"), "billing check failed");
});

describe("Engine: invoice in draft status", () => {
  const ctx = buildContext({
    invoice: { ...baseInvoice(), status: "draft" },
  });
  const result = evaluateReadiness(ctx);
  assert(result.status === "not_ready", "status is not_ready");
  assert(result.checks.some(c => c.checkId === "billing_totals" && c.status === "FAIL"), "billing check failed");
  assert(result.failureSummary.includes("issued"), "failure mentions must be issued");
});

describe("Engine: NHIS coverage / non-NHIS invoice mismatch", () => {
  const ctx = buildContext({
    invoice: baseInvoice("self_pay"), // coverage is NHIS but invoice is self_pay
  });
  const result = evaluateReadiness(ctx);
  assert(result.status === "not_ready", "status is not_ready");
  assert(result.checks.some(c => c.checkId === "billing_totals" && c.status === "FAIL"), "billing check failed");
  assert(result.failureSummary.includes("NHIS") && result.failureSummary.includes("payerType"), "failure mentions payer mismatch");
});

describe("Engine: self-pay encounter skips insurance checks", () => {
  const ctx = buildContext({
    encounterCoverage: baseCoverage("self_pay"),
    patientInsurance: null,
    latestEligibility: null,
    attendanceVerification: {
      id: "av_001", method: "NOT_REQUIRED", code: null,
      verificationStatus: "not_required", verifiedAt: new Date(),
      expiresAt: null,
    },
    invoice: baseInvoice("self_pay"),
  });
  const result = evaluateReadiness(ctx);
  assertEqual(result.status, "ready_for_export", "self-pay encounter is ready");
  assertEqual(result.checksFailed, 0, "no failures");
});

describe("Engine: services missing NHIS tariff codes (warning only)", () => {
  const ctx = buildContext({
    services: [{ ...baseServices()[0], nhisServiceCode: null }],
  });
  const result = evaluateReadiness(ctx);
  // Warning only — doesn't block readiness
  assert(result.checks.some(c => c.checkId === "valid_services" && c.status === "WARNING"), "services check is WARNING");
  assertEqual(result.status, "ready_for_validation", "status is ready_for_validation (warnings don't block)");
});

describe("Engine: medications missing NHIS codes (warning only)", () => {
  const ctx = buildContext({
    medications: [{ ...baseMedications()[0], nhisCode: null }],
  });
  const result = evaluateReadiness(ctx);
  assert(result.checks.some(c => c.checkId === "valid_medicines" && c.status === "WARNING"), "medicines check is WARNING");
  assertEqual(result.status, "ready_for_validation", "status is ready_for_validation");
});

describe("Engine: no services and no medications (warnings)", () => {
  const ctx = buildContext({ services: [], medications: [] });
  const result = evaluateReadiness(ctx);
  assertEqual(result.status, "ready_for_validation", "status is ready_for_validation");
  assert(result.checksWarning >= 2, "at least 2 warnings");
});

describe("Engine: manual vs official eligibility verification distinction", () => {
  // Manual verification → still passes but with WARNING severity (not INFO)
  const ctxManual = buildContext({
    latestEligibility: { ...baseEligibility(), verificationSource: "manual" },
  });
  const resultManual = evaluateReadiness(ctxManual);
  const manualCheck = resultManual.checks.find(c => c.checkId === "eligibility_verified")!;
  assertEqual(manualCheck.status, "PASS", "manual verification passes");
  assertEqual(manualCheck.severity, "WARNING", "manual verification is WARNING severity");
  assert(manualCheck.message.includes("Manually verified"), "message mentions manual");

  // Official NHIA verification → passes with INFO severity
  const ctxOfficial = buildContext({
    latestEligibility: { ...baseEligibility(), verificationSource: "nhia_integration" },
  });
  const resultOfficial = evaluateReadiness(ctxOfficial);
  const officialCheck = resultOfficial.checks.find(c => c.checkId === "eligibility_verified")!;
  assertEqual(officialCheck.severity, "INFO", "official verification is INFO severity");
  assert(officialCheck.message.includes("Officially verified"), "message mentions official");
});

describe("Engine: existing rejected InsuranceClaim triggers warning", () => {
  const ctx = buildContext({
    insuranceClaim: {
      id: "clm_001", claimNumber: "CLM-2026-001",
      status: "rejected", isNhisValidated: false,
    },
  });
  const result = evaluateReadiness(ctx);
  const check = result.checks.find(c => c.checkId === "claim_info")!;
  assertEqual(check.status, "WARNING", "rejected claim is WARNING");
  assert(check.message.includes("REJECTED"), "message mentions rejected");
});

describe("Engine: validated InsuranceClaim promotes to ready_for_export", () => {
  const ctx = buildContext({
    insuranceClaim: {
      id: "clm_001", claimNumber: "CLM-2026-001",
      status: "submitted", isNhisValidated: true,
    },
    // Add a warning to verify the validated claim still promotes to ready_for_export
    services: [{ ...baseServices()[0], nhisServiceCode: null }],
  });
  const result = evaluateReadiness(ctx);
  assertEqual(result.status, "ready_for_export", "validated claim promotes to ready_for_export despite warnings");
});

describe("Engine: failure summary is actionable (section 27)", () => {
  const ctx = buildContext({
    latestEligibility: null,
    attendanceVerification: null,
    diagnoses: [],
  });
  const result = evaluateReadiness(ctx);
  // Each failure should have a label, message, and remediation hint
  const failures = result.checks.filter(c => c.status === "FAIL");
  for (const f of failures) {
    assert(!!f.label, `failure ${f.checkId} has label`);
    assert(!!f.message, `failure ${f.checkId} has message`);
    assert(!!f.source, `failure ${f.checkId} has source`);
    // remediationHint is optional but recommended
  }
  assert(result.failureSummary.length > 0, "failure summary is non-empty");
  assert(result.failureSummary.includes("✗"), "failure summary uses ✗ markers");
});

describe("Engine: readiness score is computed correctly", () => {
  // 12 checks total, 1 skipped (self-pay skips 3: insurance/eligibility/attendance),
  // so effective total varies
  const ctxFull = buildContext();
  const resultFull = evaluateReadiness(ctxFull);
  assertEqual(resultFull.readinessScore, 100, "full context scores 100%");

  const ctxFail = buildContext({ latestEligibility: null });
  const resultFail = evaluateReadiness(ctxFail);
  assert(resultFail.readinessScore < 100, "context with failure scores < 100%");
  assertEqual(resultFail.checksFailed, 1, "exactly 1 failure");
});

describe("Engine: link IDs are propagated to result", () => {
  const ctx = buildContext();
  const result = evaluateReadiness(ctx);
  assertEqual(result.coverageId, "cov_001", "coverageId propagated");
  assertEqual(result.eligibilityVerificationId, "ev_001", "eligibilityVerificationId propagated");
  assertEqual(result.attendanceVerificationId, "av_001", "attendanceVerificationId propagated");
  assertEqual(result.invoiceId, "inv_001", "invoiceId propagated");
});

// =====================================================================
// SUMMARY
// =====================================================================
console.log("\n" + "=".repeat(70));
console.log(`  UPSTREAM WORKFLOW TESTS — PASSED: ${passed}, FAILED: ${failed}`);
console.log("=".repeat(70));

if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f}`);
  process.exit(1);
} else {
  console.log("\n✓ All upstream workflow tests passed.");
  process.exit(0);
}
