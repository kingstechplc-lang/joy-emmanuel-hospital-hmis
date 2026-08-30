// =====================================================================
// NHIS/NHIA END-TO-END INTEGRATION TEST
// =====================================================================
// Proves the full encounter → claim XML pipeline works against the live
// Neon PostgreSQL database.
//
// APPROACH:
// - Reference/prerequisite data (org, facility, provider, services, etc.)
//   is created via Prisma (these are setup, not business logic).
// - Workflow data (patient, encounter, coverage, eligibility, attendance,
//   diagnosis, invoice) is created via Prisma following the EXACT SAME
//   validation rules and field mappings as the route handlers.
// - The claim pipeline (readiness engine, ICO builder, validator, XML
//   serializer, transport) is called via its ACTUAL EXPORTED FUNCTIONS —
//   the same functions the /api/nhia-claims and /api/claim-readiness
//   route handlers call.
//
// This proves: DB schema → business logic → ICO → validation → XML → export
// all work together end-to-end.
//
// Run: set -a && source .env && set +a && npx tsx scripts/nhia-tests/e2e-test.ts
// =====================================================================
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  buildICOFromEncounter,
  validateICO,
  serializeNHIAClaim,
  generateAndExportClaim,
} from "../../src/integrations/nhia/claim-it";
import { evaluateReadiness } from "../../src/lib/nhis-workflow/claim-readiness-engine";

const prisma = new PrismaClient();

// =====================================================================
// Test results tracking
// =====================================================================
const results: { stage: string; status: "PASS" | "FAIL"; detail: string; ids?: Record<string, string> }[] = [];
let stepNum = 0;
function step(name: string) { stepNum++; return `[${stepNum}] ${name}`; }
function pass(stage: string, detail: string, ids?: Record<string, string>) {
  results.push({ stage, status: "PASS", detail, ids });
  console.log(`  ✓ ${stage}: ${detail}`);
}
function fail(stage: string, detail: string) {
  results.push({ stage, status: "FAIL", detail });
  console.error(`  ✗ ${stage}: ${detail}`);
}

// =====================================================================
// Cleanup tracking — all created records are tracked for removal
// =====================================================================
const created: { model: string; id: string }[] = [];
function track(model: string, id: string) { created.push({ model, id }); }

async function cleanup() {
  console.log("\n--- CLEANUP ---");
  // Delete audit logs first — they reference org/user/facility/patient via FK
  try {
    const al = await prisma.auditLog.deleteMany({ where: { organizationId: ids.organizationId } });
    if (al.count > 0) console.log(`  Deleted ${al.count} AuditLog records`);
  } catch {}

  const order = [
    "NhiaClaimExport", "ClaimReadinessAssessment", "InsuranceClaim", "ClaimDiagnosis", "ClaimItem",
    "Payment", "InvoiceItem", "Invoice",
    "DispenseRecord", "PrescriptionItem", "Prescription",
    "Diagnosis", "Consultation",
    "AttendanceVerification", "EligibilityVerification", "EncounterCoverage",
    "Encounter",
    "PatientInsurance", "PatientIdentifier", "Patient",
    "InventoryBatch", "InventoryItem",
    "DiagnosisCatalog", "Service", "Medication",
    "InsuranceProvider",
    "StaffFacility", "Staff",
    "UserRole", "User",
    "Department", "Facility", "Organization",
  ];
  for (const model of order) {
    const ids = created.filter(c => c.model === model).map(c => c.id);
    if (ids.length === 0) continue;
    try {
      // @ts-expect-error dynamic model access
      await prisma[model].deleteMany({ where: { id: { in: ids } } });
      console.log(`  Deleted ${ids.length} ${model}`);
    } catch (e: any) {
      console.log(`  SKIP ${model}: ${e.message?.slice(0, 100)}`);
    }
  }
}

// =====================================================================
// MAIN TEST
// =====================================================================
async function main() {
  const TEST_TAG = `NHIS-E2E-${Date.now()}`;
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  NHIS END-TO-END INTEGRATION TEST`);
  console.log(`  Test Tag: ${TEST_TAG}`);
  console.log(`${"=".repeat(70)}\n`);

  const ids: Record<string, string> = {};

  try {
    // =================================================================
    // PREREQUISITE DATA (reference data — not business logic)
    // =================================================================
    console.log("--- PREREQUISITE DATA SETUP ---\n");

    // 1. Organization
    const org = await prisma.organization.create({
      data: { name: `E2E Test Org ${TEST_TAG}`, code: `E2E-${Date.now().toString().slice(-6)}`, status: "active" },
    });
    ids.organizationId = org.id; track("Organization", org.id);
    pass(step("Organization"), `Created: ${org.name} (${org.code})`);

    // 2. Facility
    const facility = await prisma.facility.create({
      data: {
        organizationId: org.id, name: `E2E Test Hospital`, code: `E2E${Date.now().toString().slice(-4)}`,
        facilityType: "district_hospital", region: "Greater Accra", city: "Accra",
        country: "Ghana", status: "active",
      },
    });
    ids.facilityId = facility.id; track("Facility", facility.id);
    pass(step("Facility"), `Created: ${facility.name} (${facility.code})`);

    // 3. Department
    const dept = await prisma.department.create({
      data: { facilityId: facility.id, name: "General OPD", code: "GOPD", status: "active" },
    });
    ids.departmentId = dept.id; track("Department", dept.id);
    pass(step("Department"), `Created: ${dept.name}`);

    // 4. User (org admin with all permissions)
    const passwordHash = await bcrypt.hash("E2E-Test-Password-123!", 10);
    const user = await prisma.user.create({
      data: {
        organizationId: org.id, username: `e2e-test-${Date.now()}`,
        email: `e2e-test-${Date.now()}@test.local`,
        passwordHash, firstName: "E2E", lastName: "Tester",
        status: "active",
      },
    });
    ids.userId = user.id; track("User", user.id);
    // Assign super_admin role (has all permissions)
    const superAdminRole = await prisma.role.findFirst({ where: { code: "super_admin" } });
    if (superAdminRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: superAdminRole.id, facilityId: facility.id } });
      track("UserRole", `${user.id}-${superAdminRole.id}`);
    }
    pass(step("Test User"), `Created: ${user.username} (super_admin)`);

    // 5. Insurance Provider (NHIS)
    const provider = await prisma.insuranceProvider.create({
      data: {
        organizationId: org.id, name: "National Health Insurance Scheme",
        code: "NHIS-E2E", providerType: "nhis", status: "active",
      },
    });
    ids.providerId = provider.id; track("InsuranceProvider", provider.id);
    pass(step("Insurance Provider"), `Created: ${provider.name} (${provider.code})`);

    // 6. Diagnosis Catalog entry (ICD-10 with NHIS G-DRG)
    const dxCatalog = await prisma.diagnosisCatalog.create({
      data: {
        organizationId: org.id, code: "I10", codeSystem: "ICD-10",
        name: "Essential (primary) hypertension",
        category: "cardiovascular", isChronicDefault: true,
        nhisGdrgCode: "GDRG-95", nhisGdrgName: "Hypertension management - outpatient",
        nhisTariff: 45.00, isNhisClaimable: true, isActive: true,
      },
    });
    ids.diagnosisCatalogId = dxCatalog.id; track("DiagnosisCatalog", dxCatalog.id);
    pass(step("Diagnosis Catalog"), `Created: ${dxCatalog.code} — ${dxCatalog.name} (G-DRG: ${dxCatalog.nhisGdrgCode})`);

    // 7. Service (with NHIS tariff code)
    const service = await prisma.service.create({
      data: {
        organizationId: org.id, name: "OPD Consultation", code: "OPD-CONSULT-E2E",
        category: "consultation", serviceType: "consultation",
        defaultPrice: 35.00, nhisPrice: 35.00, nhisEligible: true,
        nhisServiceCode: "CONS-001", status: "active",
      },
    });
    ids.serviceId = service.id; track("Service", service.id);
    pass(step("Service"), `Created: ${service.name} (NHIS code: ${service.nhisServiceCode}, tariff: ₵${service.nhisPrice})`);

    // 8. Medication (with NHIS code)
    const medication = await prisma.medication.create({
      data: {
        organizationId: org.id, genericName: "Amlodipine", brandName: "Norvasc",
        strength: "5mg", strengthValue: 5, strengthUnit: "mg",
        dosageForm: "tablet", route: "oral", unit: "tablet",
        nhisCode: "AML-5MG-E2E", nhisTariffAmount: 0.50,
        nhisPrescribingLevel: "B1", nhisUnitOfPricing: "Tablet",
        status: "active",
      },
    });
    ids.medicationId = medication.id; track("Medication", medication.id);
    pass(step("Medication"), `Created: ${medication.genericName} ${medication.strength} (NHIS code: ${medication.nhisCode})`);

    // =================================================================
    // WORKFLOW DATA (following same rules as route handlers)
    // =================================================================
    console.log("\n--- WORKFLOW EXECUTION ---\n");

    // 9. Patient Registration (POST /api/patients equivalent)
    const patientNumber = `JEM-${String(Date.now()).slice(-7)}`;
    const patient = await prisma.patient.create({
      data: {
        organizationId: org.id, patientNumber,
        firstName: "E2E", lastName: "TestPatient",
        dateOfBirth: new Date("1985-04-12"), sex: "male",
        phone: "+233240000000", status: "active",
        registeredAtFacilityId: facility.id, registeredBy: user.id,
      },
    });
    ids.patientId = patient.id; track("Patient", patient.id);
    // Ghana Card identifier
    await prisma.patientIdentifier.create({
      data: { patientId: patient.id, identifierType: "ghana_card", identifierValue: `GHA-E2E-${Date.now()}`, isPrimary: true, verified: true, verifiedAt: new Date() },
    });
    track("PatientIdentifier", `${patient.id}-ghana`);
    pass(step("Patient Registration"), `Created: ${patient.firstName} ${patient.lastName} (${patient.patientNumber})`);

    // 10. Patient Insurance (same logic as /api/patients POST insurance block)
    const patientInsurance = await prisma.patientInsurance.create({
      data: {
        patientId: patient.id, insuranceProviderId: provider.id,
        membershipNumber: `NHIS-E2E-${Date.now().toString().slice(-10)}`,
        principalMember: `${patient.firstName} ${patient.lastName}`,
        relationshipToPrincipal: "self",
        coverageStart: new Date(),
        coverageEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        verificationStatus: "verified", verifiedAt: new Date(),
        status: "active",
      },
    });
    ids.patientInsuranceId = patientInsurance.id; track("PatientInsurance", patientInsurance.id);
    pass(step("Patient Insurance"), `Created: member #${patientInsurance.membershipNumber} (verified, active)`);

    // 11. Encounter (POST /api/encounters equivalent)
    const encounterNumber = `ENC-2026-${String(Date.now()).slice(-6)}`;
    const encounter = await prisma.encounter.create({
      data: {
        patientId: patient.id, facilityId: facility.id, departmentId: dept.id,
        encounterNumber, encounterType: "opd", status: "in_progress",
        priority: "routine", startAt: new Date(), createdById: user.id,
      },
    });
    ids.encounterId = encounter.id; track("Encounter", encounter.id);
    pass(step("Encounter"), `Created: ${encounter.encounterNumber} (${encounter.encounterType})`);

    // 12. Encounter Coverage (POST /api/encounter-coverage equivalent)
    const coverage = await prisma.encounterCoverage.create({
      data: {
        organizationId: org.id, facilityId: facility.id, encounterId: encounter.id,
        payerType: "nhis", patientInsuranceId: patientInsurance.id,
        insuranceProviderId: provider.id,
        coveragePercentage: 100, patientCopay: 0,
        patientResponsibility: 0, payerResponsibility: 0,
        status: "active", selectedById: user.id, selectedByName: "E2E Tester",
      },
    });
    ids.coverageId = coverage.id; track("EncounterCoverage", coverage.id);
    pass(step("Encounter Coverage"), `Created: payer=NHIS, coverage=100%`);

    // 13. Eligibility Verification (POST /api/eligibility equivalent — manual source)
    const eligibility = await prisma.eligibilityVerification.create({
      data: {
        organizationId: org.id, patientId: patient.id, encounterId: encounter.id,
        facilityId: facility.id, insuranceProviderId: provider.id,
        patientInsuranceId: patientInsurance.id,
        membershipNumber: patientInsurance.membershipNumber,
        verificationStatus: "verified", coverageStatus: "active",
        coverageStart: patientInsurance.coverageStart, coverageEnd: patientInsurance.coverageEnd,
        verificationMethod: "manual", verificationSource: "manual",
        expiresAt: patientInsurance.coverageEnd,
        verifiedById: user.id, verifiedByName: "E2E Tester",
      },
    });
    ids.eligibilityId = eligibility.id; track("EligibilityVerification", eligibility.id);
    pass(step("Eligibility Verification"), `Created: verified (manual, not official NHIA)`);

    // 14. Attendance Verification (POST /api/attendance-verification equivalent)
    const { createHash } = await import("crypto");
    const attendanceCode = `CCC-E2E-${Date.now()}`;
    const codeHash = createHash("sha256").update(`nhia-attendance::${attendanceCode}`).digest("hex");
    const attendance = await prisma.attendanceVerification.create({
      data: {
        organizationId: org.id, facilityId: facility.id, encounterId: encounter.id,
        patientId: patient.id, patientInsuranceId: patientInsurance.id,
        method: "CCC", code: attendanceCode, codeHash,
        verificationStatus: "verified", verifiedAt: new Date(),
        source: "manual", capturedById: user.id, capturedByName: "E2E Tester",
      },
    });
    ids.attendanceId = attendance.id; track("AttendanceVerification", attendance.id);
    pass(step("Attendance Verification"), `Created: CCC method, verified (code hashed)`);

    // 15. Diagnosis (POST /api/diagnoses equivalent)
    const diagnosis = await prisma.diagnosis.create({
      data: {
        patientId: patient.id, encounterId: encounter.id, catalogId: dxCatalog.id,
        diagnosisCode: dxCatalog.code, codeSystem: "ICD-10",
        diagnosisName: dxCatalog.name, diagnosisType: "primary",
        clinicalStatus: "active", verificationStatus: "confirmed",
        isPrimary: true, isChronic: true, diagnosedById: user.id,
      },
    });
    ids.diagnosisId = diagnosis.id; track("Diagnosis", diagnosis.id);
    pass(step("Diagnosis"), `Created: ${diagnosis.diagnosisCode} — ${diagnosis.diagnosisName} (primary)`);

    // 16. Invoice with NHIS payer + line items (POST /api/invoices equivalent)
    const invoiceNumber = `INV-2026-${String(Date.now()).slice(-6)}`;
    const unitPrice = 35.00;
    const qty = 1;
    const total = unitPrice * qty;
    const invoice = await prisma.invoice.create({
      data: {
        patientId: patient.id, encounterId: encounter.id, facilityId: facility.id,
        invoiceNumber, invoiceType: "nhis", status: "issued",
        payerType: "nhis", subtotal: total, discount: 0, tax: 0, taxRate: 0,
        total, amountPaid: 0, amountRefunded: 0, amountCredited: 0, balance: total,
        payerResponsibility: total, patientResponsibility: 0,
        insuranceResponsibility: total, nhisResponsibility: total,
        nhisNumber: patientInsurance.membershipNumber,
        insuranceProviderId: provider.id,
        currency: "GHS", issuedAt: new Date(), issuedById: user.id,
        items: {
          create: [{
            serviceId: service.id, description: service.name,
            quantity: qty, unitPrice, discount: 0, tax: 0, total,
            referenceType: "consultation",
          }],
        },
      },
      include: { items: true },
    });
    ids.invoiceId = invoice.id; track("Invoice", invoice.id);
    invoice.items.forEach(it => track("InvoiceItem", it.id));
    pass(step("NHIS Invoice"), `Created: ${invoice.invoiceNumber} (₵${total.toFixed(2)}, payer=NHIS, ${invoice.items.length} item(s))`);

    // =================================================================
    // CLAIM READINESS — Phase 1: Should initially fail on incomplete encounter
    // =================================================================
    console.log("\n--- CLAIM READINESS TEST (incomplete encounter) ---\n");

    // Create a SECOND encounter WITHOUT attendance/eligibility/diagnosis/invoice
    const encounter2Number = `ENC-2026-${String(Date.now() + 1).slice(-6)}`;
    const encounter2 = await prisma.encounter.create({
      data: {
        patientId: patient.id, facilityId: facility.id, departmentId: dept.id,
        encounterNumber: encounter2Number, encounterType: "opd", status: "open",
        priority: "routine", startAt: new Date(), createdById: user.id,
      },
    });
    track("Encounter", encounter2.id);

    // Build readiness context for encounter2 (incomplete)
    const ctx2 = await buildReadinessContext(encounter2.id, org.id);
    if (!ctx2) { fail(step("Readiness (incomplete)"), "Could not build context"); }
    else {
      const result2 = evaluateReadiness(ctx2);
      const failedChecks = result2.checks.filter(c => c.status === "FAIL");
      if (result2.status === "not_ready" && failedChecks.length >= 3) {
        pass(step("Readiness (incomplete)"), `Correctly NOT_READY — ${failedChecks.length} failures: ${failedChecks.map(c => c.checkId).join(", ")}`);
      } else {
        fail(step("Readiness (incomplete)"), `Expected not_ready with 3+ failures, got ${result2.status} with ${failedChecks.length} failures`);
      }
    }

    // Clean up encounter2
    await prisma.encounter.delete({ where: { id: encounter2.id } }).catch(() => {});

    // =================================================================
    // CLAIM READINESS — Phase 2: Complete encounter should pass
    // =================================================================
    console.log("\n--- CLAIM READINESS TEST (complete encounter) ---\n");

    const ctx = await buildReadinessContext(encounter.id, org.id);
    if (!ctx) { fail(step("Readiness (complete)"), "Could not build context"); }
    else {
      const result = evaluateReadiness(ctx);
      console.log(`    Status: ${result.status}`);
      console.log(`    Score: ${result.readinessScore}% (${result.checksPassed}/${result.checksTotal} passed)`);
      console.log(`    Failures: ${result.checksFailed}, Warnings: ${result.checksWarning}`);
      if (result.checksFailed === 0) {
        pass(step("Readiness (complete)"), `${result.status} — ${result.checksPassed}/${result.checksTotal} checks passed, ${result.checksWarning} warning(s)`);
        if (result.warningsSummary) {
          console.log(`    Warnings: ${result.warningsSummary.split("\n").join("; ")}`);
        }
      } else {
        fail(step("Readiness (complete)"), `${result.checksFailed} failures: ${result.failureSummary}`);
      }
    }

    // Persist the readiness assessment (same as POST /api/claim-readiness)
    const readinessAssessment = await prisma.claimReadinessAssessment.create({
      data: {
        organizationId: org.id, facilityId: facility.id, encounterId: encounter.id,
        patientId: patient.id, patientName: `${patient.firstName} ${patient.lastName}`,
        status: evaluateReadiness(ctx!).status,
        readinessScore: evaluateReadiness(ctx!).readinessScore,
        checksTotal: evaluateReadiness(ctx!).checksTotal,
        checksPassed: evaluateReadiness(ctx!).checksPassed,
        checksFailed: evaluateReadiness(ctx!).checksFailed,
        checksWarning: evaluateReadiness(ctx!).checksWarning,
        checks: JSON.stringify(evaluateReadiness(ctx!).checks),
        failureSummary: evaluateReadiness(ctx!).failureSummary || null,
        warningsSummary: evaluateReadiness(ctx!).warningsSummary || null,
        coverageId: coverage.id, eligibilityVerificationId: eligibility.id,
        attendanceVerificationId: attendance.id, invoiceId: invoice.id,
        evaluatedById: user.id, evaluatedByName: "E2E Tester",
      },
    });
    ids.readinessId = readinessAssessment.id; track("ClaimReadinessAssessment", readinessAssessment.id);
    pass(step("Readiness Assessment Persisted"), `ID: ${readinessAssessment.id}, status: ${readinessAssessment.status}`);

    // =================================================================
    // CLAIM GENERATION — Full pipeline (ICO → Validate → Serialize → Export)
    // =================================================================
    console.log("\n--- CLAIM GENERATION PIPELINE ---\n");

    // Step A: Build ICO
    const { ico, warnings: adapterWarnings } = await buildICOFromEncounter(encounter.id, org.id);
    pass(step("ICO Generation"), `Built ICO: claim=${ico.header.claimNumber}, ${ico.diagnoses.length} dx, ${ico.services.length} svc, ${ico.drugs.length} drug(s)`);
    if (adapterWarnings.length > 0) {
      console.log(`    Adapter warnings: ${adapterWarnings.join("; ")}`);
    }

    // Step B: Validate ICO
    const validation = validateICO(ico);
    if (validation.valid) {
      pass(step("ICO Validation"), `VALID — 0 errors, ${validation.warnings.length} warning(s)`);
    } else {
      fail(step("ICO Validation"), `${validation.errors.length} errors: ${validation.errors.map(e => e.code).join(", ")}`);
    }

    // Step C: Serialize XML
    const xml = serializeNHIAClaim(ico);
    if (xml && xml.includes("<?xml") && xml.includes("<Claims") && xml.includes("</Claims>")) {
      pass(step("XML Serialization"), `Generated ${Buffer.byteLength(xml, "utf8")} bytes, ${xml.split("\n").length} lines`);
    } else {
      fail(step("XML Serialization"), "XML is malformed or empty");
    }

    // Step D: Full pipeline via generateAndExportClaim (same as POST /api/nhia-claims)
    const pipelineResult = await generateAndExportClaim(encounter.id, org.id, { transportMode: "file" });
    if (pipelineResult.xml && pipelineResult.validation.valid && pipelineResult.exportResult?.success) {
      pass(step("Full Pipeline (generateAndExportClaim)"), `XML generated + export succeeded, claimRef: ${pipelineResult.exportResult.claimRef}`);
    } else {
      fail(step("Full Pipeline (generateAndExportClaim)"), `valid=${pipelineResult.validation.valid}, xml=${!!pipelineResult.xml}, export=${pipelineResult.exportResult?.success}`);
    }

    // =================================================================
    // XML VALIDATION — Verify content + structure + field mapping
    // =================================================================
    console.log("\n--- XML CONTENT VALIDATION ---\n");

    const checks: { name: string; pass: boolean; detail: string }[] = [];
    checks.push({ name: "XML declaration", pass: xml.startsWith('<?xml version="1.0" encoding="UTF-8"'), detail: xml.split("\n")[0] });
    checks.push({ name: "Root element", pass: xml.includes('<Claims schemaVersion="2.0">'), detail: "Claims schemaVersion=2.0" });
    checks.push({ name: "Claim number", pass: xml.includes(ico.header.claimNumber), detail: ico.header.claimNumber });
    checks.push({ name: "Facility code", pass: xml.includes(facility.code), detail: facility.code });
    checks.push({ name: "Patient surname", pass: xml.includes(`<Surname>${patient.lastName}</Surname>`), detail: patient.lastName });
    checks.push({ name: "Patient other names", pass: xml.includes(`<OtherNames>${patient.firstName}</OtherNames>`), detail: patient.firstName });
    // NHIS member number is normalized (spaces/dashes stripped, uppercased) by the adapter
    const normalizedMemberNumber = (patientInsurance.membershipNumber || "").replace(/[\s-]/g, "").toUpperCase();
    checks.push({ name: "NHIS member number (normalized)", pass: xml.includes(normalizedMemberNumber), detail: normalizedMemberNumber });
    checks.push({ name: "Date of birth", pass: xml.includes("1985-04-12"), detail: "1985-04-12" });
    checks.push({ name: "Sex (M)", pass: xml.includes("<Sex>M</Sex>"), detail: "M" });
    checks.push({ name: "Encounter type (OPD)", pass: xml.includes("<EncounterType>OPD</EncounterType>"), detail: "OPD" });
    checks.push({ name: "Attendance method (CCC)", pass: xml.includes("<Method>CCC</Method>"), detail: "CCC" });
    checks.push({ name: "Attendance status (VERIFIED)", pass: xml.includes("<VerificationStatus>VERIFIED</VerificationStatus>"), detail: "VERIFIED" });
    checks.push({ name: "Diagnosis code (I10)", pass: xml.includes("<DiagnosisCode>I10</DiagnosisCode>"), detail: "I10" });
    checks.push({ name: "Diagnosis primary flag", pass: xml.includes("<IsPrimary>true</IsPrimary>"), detail: "true" });
    checks.push({ name: "G-DRG code", pass: xml.includes(`GDRG-95`), detail: "GDRG-95" });
    checks.push({ name: "Service description", pass: xml.includes(service.name), detail: service.name });
    checks.push({ name: "NHIS tariff code", pass: xml.includes(service.nhisServiceCode!), detail: service.nhisServiceCode! });
    checks.push({ name: "Service unit price", pass: xml.includes("35.00"), detail: "35.00" });
    checks.push({ name: "Gross amount", pass: xml.includes("<GrossAmount>35.00</GrossAmount>"), detail: "35.00" });
    checks.push({ name: "NHIS amount", pass: xml.includes("<NhisAmount>35.00</NhisAmount>"), detail: "35.00" });
    checks.push({ name: "Source system", pass: xml.includes("<SourceSystem>JEM-HMIS</SourceSystem>"), detail: "JEM-HMIS" });

    for (const c of checks) {
      if (c.pass) pass(`  XML: ${c.name}`, c.detail);
      else fail(`  XML: ${c.name}`, `Expected: ${c.detail}`);
    }

    // =================================================================
    // DATABASE PERSISTENCE VERIFICATION
    // =================================================================
    console.log("\n--- DATABASE PERSISTENCE VERIFICATION ---\n");

    // Verify NhiaClaimExport was persisted (same as POST /api/nhia-claims upsert)
    // Note: generateAndExportClaim doesn't persist — the API route does the upsert.
    // For this E2E test, we manually persist to prove the schema works.
    const exportRecord = await prisma.nhiaClaimExport.create({
      data: {
        organizationId: org.id, facilityId: facility.id, encounterId: encounter.id,
        patientId: patient.id, patientName: `${patient.firstName} ${patient.lastName}`,
        invoiceId: invoice.id,
        claimNumber: ico.header.claimNumber,
        batchRef: ico.header.claimBatchRef,
        submissionPeriod: ico.header.submissionPeriod,
        status: "exported", isValid: validation.valid,
        errorCount: validation.errors.length, warningCount: validation.warnings.length,
        validationErrors: JSON.stringify(validation.errors),
        adapterWarnings: JSON.stringify(adapterWarnings),
        totalServiceAmount: ico.totals.totalServiceAmount,
        totalDrugAmount: ico.totals.totalDrugAmount,
        grossAmount: ico.totals.grossAmount,
        nhisAmount: ico.totals.nhisAmount,
        patientAmount: ico.totals.patientAmount,
        netAmount: ico.totals.netAmount,
        itemCount: ico.services.length + ico.drugs.length,
        diagnosisCount: ico.diagnoses.length,
        xmlPayload: xml, xmlSizeBytes: Buffer.byteLength(xml, "utf8"),
        transportMode: "file",
        filePath: pipelineResult.exportResult?.filePath || null,
        generatedById: user.id, generatedByName: "E2E Tester",
      },
    });
    ids.exportId = exportRecord.id; track("NhiaClaimExport", exportRecord.id);
    pass(step("NhiaClaimExport Persisted"), `ID: ${exportRecord.id}, status: ${exportRecord.status}, XML: ${exportRecord.xmlSizeBytes} bytes`);

    // Verify all workflow records exist in DB
    const dbChecks = [
      { name: "Patient", check: () => prisma.patient.findUnique({ where: { id: ids.patientId } }) },
      { name: "PatientInsurance", check: () => prisma.patientInsurance.findUnique({ where: { id: ids.patientInsuranceId } }) },
      { name: "Encounter", check: () => prisma.encounter.findUnique({ where: { id: ids.encounterId } }) },
      { name: "EncounterCoverage", check: () => prisma.encounterCoverage.findUnique({ where: { id: ids.coverageId } }) },
      { name: "EligibilityVerification", check: () => prisma.eligibilityVerification.findUnique({ where: { id: ids.eligibilityId } }) },
      { name: "AttendanceVerification", check: () => prisma.attendanceVerification.findUnique({ where: { id: ids.attendanceId } }) },
      { name: "Diagnosis", check: () => prisma.diagnosis.findUnique({ where: { id: ids.diagnosisId } }) },
      { name: "Invoice", check: () => prisma.invoice.findUnique({ where: { id: ids.invoiceId } }) },
      { name: "ClaimReadinessAssessment", check: () => prisma.claimReadinessAssessment.findUnique({ where: { id: ids.readinessId } }) },
      { name: "NhiaClaimExport", check: () => prisma.nhiaClaimExport.findUnique({ where: { id: ids.exportId } }) },
    ];
    for (const dc of dbChecks) {
      const rec = await dc.check();
      if (rec) pass(`  DB: ${dc.name} exists`, rec.id);
      else fail(`  DB: ${dc.name} exists`, "NOT FOUND");
    }

    // =================================================================
    // CLAIM-it TRANSPORT DOCUMENTATION
    // =================================================================
    console.log("\n--- CLAIM-it TRANSPORT ---\n");
    pass(step("CLAIM-it Transport (file mode)"), `Export result: success=${pipelineResult.exportResult?.success}, filePath=${pipelineResult.exportResult?.filePath}, claimRef=${pipelineResult.exportResult?.claimRef}`);
    console.log("    NOTE: FileExportTransport returns the XML as a downloadable response.");
    console.log("    The ClaimItBridgeTransport (localhost:31719) is NOT an eligibility API —");
    console.log("    it is an XML handoff/export bridge for the CLAIM-it desktop app.");

  } catch (e: any) {
    fail("FATAL", e?.message || String(e));
    console.error(e);
  } finally {
    // =================================================================
    // CLEANUP
    // =================================================================
    await cleanup();

    // =================================================================
    // FINAL REPORT
    // =================================================================
    console.log(`\n${"=".repeat(70)}`);
    console.log("  E2E TEST SUMMARY");
    console.log("=".repeat(70));
    const passed = results.filter(r => r.status === "PASS").length;
    const failed = results.filter(r => r.status === "FAIL").length;
    console.log(`  PASSED: ${passed}`);
    console.log(`  FAILED: ${failed}`);
    console.log("=".repeat(70));

    if (failed > 0) {
      console.log("\nFailures:");
      results.filter(r => r.status === "FAIL").forEach(r => console.log(`  ✗ ${r.stage}: ${r.detail}`));
    }

    // Print test IDs
    console.log("\n--- TEST IDENTIFIERS ---");
    Object.entries(ids).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

// =====================================================================
// buildReadinessContext — mirrors the API route's context builder
// =====================================================================
async function buildReadinessContext(encounterId: string, organizationId: string) {
  const encounter = await prisma.encounter.findUnique({
    where: { id: encounterId },
    include: { facility: true },
  });
  if (!encounter) return null;
  if (encounter.facility.organizationId !== organizationId) return null;

  const patient = await prisma.patient.findUnique({
    where: { id: encounter.patientId },
    select: { id: true, firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true },
  });

  const encounterCoverage = await prisma.encounterCoverage.findFirst({
    where: { encounterId, status: "active" },
    orderBy: { selectedAt: "desc" },
  });

  let patientInsurance: any = null;
  if (encounterCoverage?.patientInsuranceId) {
    patientInsurance = await prisma.patientInsurance.findUnique({
      where: { id: encounterCoverage.patientInsuranceId },
      include: { insuranceProvider: { select: { id: true, name: true, code: true, providerType: true } } },
    });
  } else {
    patientInsurance = await prisma.patientInsurance.findFirst({
      where: { patientId: encounter.patientId, status: "active" },
      include: { insuranceProvider: { select: { id: true, name: true, code: true, providerType: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  const latestEligibility = await prisma.eligibilityVerification.findFirst({
    where: { OR: [{ encounterId }, { patientId: encounter.patientId }] },
    orderBy: { verificationDate: "desc" },
  });

  const attendanceVerification = await prisma.attendanceVerification.findUnique({
    where: { encounterId },
  });

  const diagnoses = await prisma.diagnosis.findMany({
    where: { encounterId },
    select: { id: true, diagnosisCode: true, diagnosisName: true, isPrimary: true, codeSystem: true },
    orderBy: [{ isPrimary: "desc" }, { diagnosedAt: "asc" }],
  });

  const invoice = await prisma.invoice.findFirst({
    where: { encounterId, status: { in: ["issued", "paid", "partially_paid"] } },
    orderBy: { issuedAt: "desc" },
    include: { items: { include: { service: true } } },
  });

  const services = invoice?.items?.filter(it => it.service).map(it => ({
    id: it.service!.id, name: it.service!.name, code: it.service!.code,
    nhisServiceCode: it.service!.nhisServiceCode, nhisPrice: it.service!.nhisPrice,
    nhisEligible: it.service!.nhisEligible,
  })) || [];

  const prescriptions = await prisma.prescription.findMany({
    where: { encounterId },
    include: { items: { include: { medication: { select: { id: true, genericName: true, nhisCode: true, nhisTariffAmount: true } } }, where: { dispensedQuantity: { gt: 0 } } } },
  });
  const medications = prescriptions.flatMap(p => p.items.map(pi => ({
    id: pi.medication.id, genericName: pi.medication.genericName,
    nhisCode: pi.medication.nhisCode, nhisTariffAmount: pi.medication.nhisTariffAmount,
  })));

  const insuranceClaim = await prisma.insuranceClaim.findFirst({
    where: { encounterId },
    orderBy: { createdAt: "desc" },
    select: { id: true, claimNumber: true, status: true, isNhisValidated: true },
  });

  return {
    encounter: {
      id: encounter.id, encounterNumber: encounter.encounterNumber,
      encounterType: encounter.encounterType, startAt: encounter.startAt,
      status: encounter.status, patientId: encounter.patientId, facilityId: encounter.facilityId,
    },
    patient: patient ? {
      id: patient.id, firstName: patient.firstName, lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth, sex: patient.sex, phone: patient.phone,
    } : null,
    patientInsurance: patientInsurance ? {
      id: patientInsurance.id, membershipNumber: patientInsurance.membershipNumber,
      policyNumber: patientInsurance.policyNumber, status: patientInsurance.status,
      verificationStatus: patientInsurance.verificationStatus, coverageEnd: patientInsurance.coverageEnd,
      insuranceProvider: {
        id: patientInsurance.insuranceProvider.id, name: patientInsurance.insuranceProvider.name,
        code: patientInsurance.insuranceProvider.code, providerType: patientInsurance.insuranceProvider.providerType,
      },
    } : null,
    encounterCoverage: encounterCoverage ? {
      id: encounterCoverage.id, payerType: encounterCoverage.payerType, status: encounterCoverage.status,
      patientInsuranceId: encounterCoverage.patientInsuranceId, insuranceProviderId: encounterCoverage.insuranceProviderId,
    } : null,
    latestEligibility: latestEligibility ? {
      id: latestEligibility.id, verificationStatus: latestEligibility.verificationStatus,
      verificationMethod: latestEligibility.verificationMethod, verificationSource: latestEligibility.verificationSource,
      coverageEnd: latestEligibility.coverageEnd, expiresAt: latestEligibility.expiresAt,
      verificationDate: latestEligibility.verificationDate,
    } : null,
    attendanceVerification: attendanceVerification ? {
      id: attendanceVerification.id, method: attendanceVerification.method,
      code: attendanceVerification.code, verificationStatus: attendanceVerification.verificationStatus,
      verifiedAt: attendanceVerification.verifiedAt, expiresAt: attendanceVerification.expiresAt,
    } : null,
    diagnoses, services, medications,
    invoice: invoice ? {
      id: invoice.id, invoiceNumber: invoice.invoiceNumber, payerType: invoice.payerType,
      status: invoice.status, total: invoice.total, balance: invoice.balance,
      nhisResponsibility: invoice.nhisResponsibility, patientResponsibility: invoice.patientResponsibility,
    } : null,
    insuranceClaim: insuranceClaim ? {
      id: insuranceClaim.id, claimNumber: insuranceClaim.claimNumber,
      status: insuranceClaim.status, isNhisValidated: insuranceClaim.isNhisValidated,
    } : null,
  } as any;
}

main();
