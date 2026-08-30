// =====================================================================
// NHIA CLAIM-it Test Suite
// =====================================================================
// Validates the four core layers of the integration:
//   1. XML utilities (escape, format, ICD-10 validator, member number normalizer)
//   2. Validation engine (valid ICO, missing fields, wrong ICD-10, total mismatches)
//   3. XML serializer (golden-file comparison against fixture)
//   4. Tag configuration (no missing tags, all tags non-empty)
//
// Run: npx tsx scripts/nhia-tests/run-tests.ts
// =====================================================================
import * as fs from "fs";
import * as path from "path";
import {
  escapeXml, formatDateNHIA, formatDateTimeNHIA, formatAmountNHIA,
  xmlElement, xmlOpen, xmlClose, generateClaimRef, generateBatchRef,
  normalizeMemberNumber, isValidICD10,
} from "../../src/integrations/nhia/claim-it/utils/xml";
import { validateICO } from "../../src/integrations/nhia/claim-it/validation/ClaimsValidator";
import { serializeNHIAClaim } from "../../src/integrations/nhia/claim-it/serialization/XMLSerializer";
import { NHIA_XML_TAGS, NHIA_XML_CONFIG } from "../../src/integrations/nhia/claim-it/config/tags";
import type { IntermediateClaimsObject } from "../../src/integrations/nhia/claim-it/types/claims";

// =====================================================================
// Tiny test framework
// =====================================================================
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.error(`  ✗ FAIL: ${label}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  const aStr = JSON.stringify(actual);
  const eStr = JSON.stringify(expected);
  if (aStr === eStr) {
    passed++;
  } else {
    failed++;
    failures.push(`${label}\n    expected: ${eStr}\n    actual:   ${aStr}`);
    console.error(`  ✗ FAIL: ${label}`);
    console.error(`    expected: ${eStr}`);
    console.error(`    actual:   ${aStr}`);
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

// =====================================================================
// FIXTURES
// =====================================================================
const FIXTURES_DIR = path.join(__dirname, "..", "..", "src", "integrations", "nhia", "claim-it", "__tests__", "fixtures");

function loadSampleICO(): IntermediateClaimsObject {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, "sample-ico.json"), "utf-8");
  const obj = JSON.parse(raw);
  // Revive dates
  if (obj.header?.generatedAt) obj.header.generatedAt = new Date(obj.header.generatedAt);
  if (obj.encounter?.visitDate) obj.encounter.visitDate = new Date(obj.encounter.visitDate);
  if (obj.encounter?.arrivalTime) obj.encounter.arrivalTime = new Date(obj.encounter.arrivalTime);
  if (obj.encounter?.admissionDate) obj.encounter.admissionDate = obj.encounter.admissionDate ? new Date(obj.encounter.admissionDate) : null;
  if (obj.encounter?.dischargeDate) obj.encounter.dischargeDate = obj.encounter.dischargeDate ? new Date(obj.encounter.dischargeDate) : null;
  if (obj.encounter?.referralInfo?.referralDate) obj.encounter.referralInfo.referralDate = new Date(obj.encounter.referralInfo.referralDate);
  if (obj.patient?.dateOfBirth) obj.patient.dateOfBirth = new Date(obj.patient.dateOfBirth);
  if (obj.attendanceVerification?.verifiedAt) obj.attendanceVerification.verifiedAt = obj.attendanceVerification.verifiedAt ? new Date(obj.attendanceVerification.verifiedAt) : null;
  for (const s of obj.services || []) if (s.serviceDate) s.serviceDate = new Date(s.serviceDate);
  for (const d of obj.drugs || []) if (d.dispensingDate) d.dispensingDate = new Date(d.dispensingDate);
  return obj as IntermediateClaimsObject;
}

function loadExpectedXML(): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, "sample-expected.xml"), "utf-8");
}

// =====================================================================
// TEST 1 — XML Utilities
// =====================================================================
describe("XML Utilities: escapeXml", () => {
  assertEqual(escapeXml("hello world"), "hello world", "plain text passes through");
  assertEqual(escapeXml("a & b"), "a &amp; b", "ampersand escaped");
  assertEqual(escapeXml("a < b > c"), "a &lt; b &gt; c", "angle brackets escaped");
  assertEqual(escapeXml(`"quoted"`), "&quot;quoted&quot;", "double quotes escaped");
  assertEqual(escapeXml("it's"), "it&apos;s", "apostrophe escaped");
  assertEqual(escapeXml("a\u0001b\u0002c"), "abc", "control characters removed");
  assertEqual(escapeXml(""), "", "empty string returns empty");
  assertEqual(escapeXml(null as any), "", "null returns empty");
  assertEqual(escapeXml(undefined as any), "", "undefined returns empty");
});

describe("XML Utilities: formatDateNHIA", () => {
  assertEqual(formatDateNHIA(new Date("2026-08-15T10:30:00Z")), "2026-08-15", "ISO date formatted correctly");
  assertEqual(formatDateNHIA(new Date("2026-01-05")), "2026-01-05", "single-digit month/day zero-padded");
  assertEqual(formatDateNHIA(new Date("1985-04-12")), "1985-04-12", "DOB formatted correctly");
  assertEqual(formatDateNHIA(null), "", "null returns empty string");
  assertEqual(formatDateNHIA(undefined), "", "undefined returns empty string");
  assertEqual(formatDateNHIA(new Date("invalid")), "", "invalid date returns empty string");
});

describe("XML Utilities: formatDateTimeNHIA", () => {
  const d = new Date(2026, 7, 15, 10, 30, 45); // local time
  assertEqual(formatDateTimeNHIA(d), "2026-08-15T10:30:45", "datetime formatted correctly");
  assertEqual(formatDateTimeNHIA(null), "", "null returns empty string");
});

describe("XML Utilities: formatAmountNHIA", () => {
  assertEqual(formatAmountNHIA(0), "0.00", "zero formats as 0.00");
  assertEqual(formatAmountNHIA(35), "35.00", "whole number formats with 2 decimals");
  assertEqual(formatAmountNHIA(35.5), "35.50", "single decimal padded to 2");
  assertEqual(formatAmountNHIA(93.123), "93.12", "rounds to 2 decimals (truncate)");
  assertEqual(formatAmountNHIA(93.125), "93.13", "rounds to 2 decimals (round up)");
  assertEqual(formatAmountNHIA(-15.5), "-15.50", "negative amounts supported");
});

describe("XML Utilities: xmlElement / xmlOpen / xmlClose", () => {
  assertEqual(xmlElement("Tag", "value", 0), "<Tag>value</Tag>", "element with content, no indent");
  assertEqual(xmlElement("Tag", "value", 2), "    <Tag>value</Tag>", "element with content, indent=2");
  assertEqual(xmlElement("Tag", "", 0), "<Tag />", "empty content self-closes");
  assertEqual(xmlElement("Tag", null, 0), "<Tag />", "null content self-closes");
  assertEqual(xmlElement("Tag", undefined, 0), "<Tag />", "undefined content self-closes");
  assertEqual(xmlOpen("Foo", 1), "  <Foo>", "open tag with indent=1");
  assertEqual(xmlClose("Foo", 1), "  </Foo>", "close tag with indent=1");
  assertEqual(xmlElement("Tag", "a & b", 0), "<Tag>a &amp; b</Tag>", "element escapes content");
});

describe("XML Utilities: generateClaimRef", () => {
  const ref = generateClaimRef("AG042", "abc123def456", new Date("2026-08-15"));
  // slice(-8) of "abc123def456" = "23def456" → uppercased → "23DEF456"
  assertEqual(ref, "CLM-AG042-20260815-23DEF456", "claim ref format is correct");
  assert(ref.startsWith("CLM-"), "claim ref starts with CLM-");
  assert(ref.includes("AG042"), "claim ref includes facility code");
  assert(ref.includes("20260815"), "claim ref includes date");
  assert(ref.endsWith("23DEF456"), "claim ref ends with last 8 chars of encounterId (uppercased)");
});

describe("XML Utilities: generateBatchRef", () => {
  assertEqual(generateBatchRef("AG042", "2026-08"), "BAT-AG042-2026-08", "batch ref format is correct");
});

describe("XML Utilities: normalizeMemberNumber", () => {
  assertEqual(normalizeMemberNumber("NHIS 1234 5678"), "NHIS12345678", "spaces removed");
  assertEqual(normalizeMemberNumber("nhis-1234-5678"), "NHIS12345678", "dashes removed + uppercased");
  assertEqual(normalizeMemberNumber("  nhis1234  "), "NHIS1234", "leading/trailing whitespace trimmed");
  assertEqual(normalizeMemberNumber(null), null, "null returns null");
  assertEqual(normalizeMemberNumber(undefined), null, "undefined returns null");
  assertEqual(normalizeMemberNumber(""), null, "empty returns null");
});

describe("XML Utilities: isValidICD10", () => {
  assert(isValidICD10("I10"), "I10 (essential hypertension) is valid");
  assert(isValidICD10("E11.9"), "E11.9 (T2DM without complications) is valid");
  assert(isValidICD10("A00.0"), "A00.0 is valid");
  assert(isValidICD10("J45.909"), "J45.909 (asthma unspecified) is valid");
  assert(!isValidICD10("110"), "110 (starts with digit) is invalid");
  assert(!isValidICD10("AB10"), "AB10 (two letters) is invalid");
  assert(!isValidICD10("I1"), "I1 (too short) is invalid");
  assert(!isValidICD10("I1000"), "I1000 (too many digits without dot) is invalid");
  assert(!isValidICD10(""), "empty string is invalid");
  assert(!isValidICD10(null), "null is invalid");
  assert(!isValidICD10(undefined), "undefined is invalid");
});

// =====================================================================
// TEST 2 — Tag Configuration
// =====================================================================
describe("Tag Configuration: NHIA_XML_TAGS", () => {
  const tagEntries = Object.entries(NHIA_XML_TAGS) as [string, string][];
  assert(tagEntries.length > 50, `tag set has 50+ entries (got ${tagEntries.length})`);

  for (const [key, value] of tagEntries) {
    assert(typeof value === "string" && value.length > 0, `tag ${key} has non-empty string value`);
    assert(!value.includes(" "), `tag ${key}="${value}" contains no spaces`);
    assert(/^[A-Za-z][A-Za-z0-9_]*$/.test(value), `tag ${key}="${value}" is a valid XML name`);
  }

  // Critical tags must be present
  const criticalTags = ["ROOT", "CLAIM", "HEADER", "FACILITY", "PATIENT", "ENCOUNTER",
    "DIAGNOSES", "DIAGNOSIS", "SERVICES", "SERVICE", "DRUGS", "DRUG", "TOTALS", "METADATA"];
  for (const t of criticalTags) {
    assert(t in NHIA_XML_TAGS, `critical tag ${t} is defined`);
  }
});

describe("Tag Configuration: NHIA_XML_CONFIG", () => {
  assertEqual(NHIA_XML_CONFIG.ENCODING, "UTF-8", "encoding is UTF-8");
  assertEqual(NHIA_XML_CONFIG.VERSION, "1.0", "XML version is 1.0");
  assertEqual(NHIA_XML_CONFIG.STANDALONE, "yes", "standalone is yes");
  assertEqual(NHIA_XML_CONFIG.ROOT_ATTRIBUTE_SCHEMA_VERSION, "2.0", "schema version is 2.0");
  assertEqual(NHIA_XML_CONFIG.CURRENCY, "GHS", "currency is GHS");
  assertEqual(NHIA_XML_CONFIG.DECIMAL_PLACES, 2, "decimal places is 2");
});

// =====================================================================
// TEST 3 — Validation Engine
// =====================================================================
describe("Validator: valid ICO passes", () => {
  const ico = loadSampleICO();
  const result = validateICO(ico);
  assert(result.valid, "sample ICO is valid");
  assertEqual(result.errors.length, 0, `no errors (got ${result.errors.length})`);
});

describe("Validator: missing NHIS number fails", () => {
  const ico = loadSampleICO();
  ico.patient.nhisNumber = null;
  const result = validateICO(ico);
  assert(!result.valid, "ICO without NHIS number is invalid");
  assert(result.errors.some(e => e.code === "NHIS_MEMBER_ID_MISSING"), "error has NHIS_MEMBER_ID_MISSING code");
});

describe("Validator: missing surname fails", () => {
  const ico = loadSampleICO();
  ico.patient.surname = "";
  const result = validateICO(ico);
  assert(!result.valid, "ICO without surname is invalid");
  assert(result.errors.some(e => e.code === "PATIENT_SURNAME_MISSING"), "error has PATIENT_SURNAME_MISSING code");
});

describe("Validator: missing facility code fails", () => {
  const ico = loadSampleICO();
  ico.facility.facilityCode = "";
  const result = validateICO(ico);
  assert(!result.valid, "ICO without facility code is invalid");
  assert(result.errors.some(e => e.code === "FACILITY_CODE_MISSING"), "error has FACILITY_CODE_MISSING code");
});

describe("Validator: invalid ICD-10 code fails", () => {
  const ico = loadSampleICO();
  ico.diagnoses[0].diagnosisCode = "INVALID";
  const result = validateICO(ico);
  assert(!result.valid, "ICO with invalid ICD-10 code is invalid");
  assert(result.errors.some(e => e.code === "INVALID_ICD10"), "error has INVALID_ICD10 code");
});

describe("Validator: no primary diagnosis fails", () => {
  const ico = loadSampleICO();
  ico.diagnoses.forEach(d => { d.isPrimary = false; });
  const result = validateICO(ico);
  assert(!result.valid, "ICO without primary diagnosis is invalid");
  assert(result.errors.some(e => e.code === "NO_PRIMARY_DIAGNOSIS"), "error has NO_PRIMARY_DIAGNOSIS code");
});

describe("Validator: zero diagnoses fails", () => {
  const ico = loadSampleICO();
  ico.diagnoses = [];
  const result = validateICO(ico);
  assert(!result.valid, "ICO with no diagnoses is invalid");
  assert(result.errors.some(e => e.code === "NO_DIAGNOSES"), "error has NO_DIAGNOSES code");
});

describe("Validator: service total mismatch fails", () => {
  const ico = loadSampleICO();
  ico.totals.totalServiceAmount = 999; // doesn't match sum of services
  const result = validateICO(ico);
  assert(!result.valid, "ICO with mismatched service total is invalid");
  assert(result.errors.some(e => e.code === "SERVICE_TOTAL_MISMATCH"), "error has SERVICE_TOTAL_MISMATCH code");
});

describe("Validator: gross total mismatch fails", () => {
  const ico = loadSampleICO();
  ico.totals.grossAmount = 1; // doesn't match service + drug totals
  const result = validateICO(ico);
  assert(!result.valid, "ICO with mismatched gross total is invalid");
  assert(result.errors.some(e => e.code === "GROSS_TOTAL_MISMATCH"), "error has GROSS_TOTAL_MISMATCH code");
});

describe("Validator: no claim items fails", () => {
  const ico = loadSampleICO();
  ico.services = [];
  ico.drugs = [];
  ico.totals.totalServiceAmount = 0;
  ico.totals.totalDrugAmount = 0;
  ico.totals.grossAmount = 0;
  ico.totals.nhisAmount = 0;
  ico.totals.netAmount = 0;
  const result = validateICO(ico);
  assert(!result.valid, "ICO with no items is invalid");
  assert(result.errors.some(e => e.code === "NO_CLAIM_ITEMS"), "error has NO_CLAIM_ITEMS code");
});

describe("Validator: missing tariff code triggers warning", () => {
  const ico = loadSampleICO();
  ico.services[0].nhisTariffCode = null;
  const result = validateICO(ico);
  assert(result.warnings.some(w => w.code === "SERVICE_TARIFF_CODE_MISSING"), "warning has SERVICE_TARIFF_CODE_MISSING code");
  assert(result.valid, "missing tariff code does not invalidate the claim");
});

describe("Validator: missing drug code triggers warning", () => {
  const ico = loadSampleICO();
  ico.drugs[0].nhisMedicineCode = null;
  const result = validateICO(ico);
  assert(result.warnings.some(w => w.code === "DRUG_CODE_MISSING"), "warning has DRUG_CODE_MISSING code");
  assert(result.valid, "missing drug code does not invalidate the claim");
});

describe("Validator: zero quantity service fails", () => {
  const ico = loadSampleICO();
  ico.services[0].quantity = 0;
  const result = validateICO(ico);
  assert(!result.valid, "zero-quantity service is invalid");
  assert(result.errors.some(e => e.code === "INVALID_SERVICE_QUANTITY"), "error has INVALID_SERVICE_QUANTITY code");
});

describe("Validator: multiple primary diagnoses triggers warning", () => {
  const ico = loadSampleICO();
  ico.diagnoses.forEach(d => { d.isPrimary = true; });
  const result = validateICO(ico);
  assert(result.warnings.some(w => w.code === "MULTIPLE_PRIMARY_DIAGNOSES"), "warning has MULTIPLE_PRIMARY_DIAGNOSES code");
});

// =====================================================================
// TEST 4 — XML Serializer (golden file)
// =====================================================================
describe("Serializer: produces byte-identical golden XML", () => {
  const ico = loadSampleICO();
  const actualXml = serializeNHIAClaim(ico);
  const expectedXml = loadExpectedXML();
  assertEqual(actualXml, expectedXml, "serialized XML matches golden file exactly");
});

describe("Serializer: well-formed XML structure", () => {
  const ico = loadSampleICO();
  const xml = serializeNHIAClaim(ico);

  // XML declaration
  assert(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'), "XML declaration is correct");

  // Root element with schemaVersion attribute
  assert(xml.includes('<Claims schemaVersion="2.0">'), "root element has schemaVersion=2.0");
  assert(xml.endsWith("</Claims>"), "root element is closed");

  // All opening tags have matching closing tags (simple balance check)
  const openTags = (xml.match(/<(?!\/)(?!\?)[A-Za-z][A-Za-z0-9_]*/g) || []).length;
  const closeTags = (xml.match(/<\/[A-Za-z][A-Za-z0-9_]*/g) || []).length;
  // self-closing tags don't need closing — count them
  const selfClosing = (xml.match(/<[A-Za-z][A-Za-z0-9_]*\s*\/>/g) || []).length;
  assertEqual(openTags - selfClosing, closeTags, `open/close tag balance (open=${openTags}, close=${closeTags}, self=${selfClosing})`);
});

describe("Serializer: handles special characters safely", () => {
  const ico = loadSampleICO();
  ico.patient.surname = "O'Brien & Sons <Ltd>";
  ico.patient.otherNames = '"Quoted"';
  const xml = serializeNHIAClaim(ico);
  assert(xml.includes("<Surname>O&apos;Brien &amp; Sons &lt;Ltd&gt;</Surname>"), "surname with special chars escaped");
  assert(xml.includes("<OtherNames>&quot;Quoted&quot;</OtherNames>"), "otherNames with quotes escaped");
});

describe("Serializer: omits null/empty optional fields", () => {
  const ico = loadSampleICO();
  ico.patient.ghanaCardPin = null;
  ico.patient.cardSerialNumber = null;
  ico.facility.hpn = null;
  ico.facility.district = null;
  const xml = serializeNHIAClaim(ico);
  assert(!xml.includes("<GhanaCardPIN>"), "null GhanaCardPIN is omitted");
  assert(!xml.includes("<CardSerialNumber>"), "null CardSerialNumber is omitted");
  assert(!xml.includes("<HPN>"), "null HPN is omitted");
  assert(!xml.includes("<District>"), "null District is omitted");
});

describe("Serializer: always includes required fields", () => {
  const ico = loadSampleICO();
  const xml = serializeNHIAClaim(ico);
  const requiredTags = [
    "<ClaimBatchRef>", "<ClaimNumber>", "<SubmissionPeriod>", "<GeneratedAt>",
    "<SchemaVersion>", "<TransactionType>", "<Currency>", "<FacilityCode>",
    "<FacilityId>", "<FacilityName>",
    "<PatientId>", "<Surname>", "<OtherNames>",
    "<EncounterId>", "<EncounterNumber>", "<VisitDate>", "<EncounterType>",
    "<OpdIpdStatus>",
    "<Method>", "<VerificationStatus>",
    "<DiagnosisCode>", "<DiagnosisDescription>", "<DiagnosisType>",
    "<CodingSystem>", "<IsPrimary>",
    "<ServiceDescription>", "<Quantity>", "<UnitPrice>", "<TotalAmount>", "<ServiceDate>", "<ItemStatus>",
    "<MedicineName>", "<DispensingDate>",
    "<TotalServiceAmount>", "<TotalDrugAmount>", "<GrossAmount>", "<NetAmount>",
    "<SourceSystem>", "<SourceVersion>",
  ];
  for (const tag of requiredTags) {
    assert(xml.includes(tag), `required tag ${tag} is present`);
  }
});

describe("Serializer: formats amounts with 2 decimals", () => {
  const ico = loadSampleICO();
  const xml = serializeNHIAClaim(ico);
  assert(xml.includes("<TotalAmount>35.00</TotalAmount>"), "service total formatted as 35.00");
  assert(xml.includes("<TotalAmount>15.00</TotalAmount>"), "drug total formatted as 15.00");
  assert(xml.includes("<GrossAmount>93.00</GrossAmount>"), "gross amount formatted as 93.00");
  assert(xml.includes("<NhisAmount>93.00</NhisAmount>"), "NHIS amount formatted as 93.00");
});

// =====================================================================
// TEST 5 — End-to-End Round Trip
// =====================================================================
describe("Round-trip: serialize → parse → re-serialize is stable", () => {
  const ico = loadSampleICO();
  const xml1 = serializeNHIAClaim(ico);
  const xml2 = serializeNHIAClaim(ico);
  assertEqual(xml1, xml2, "serializing twice produces identical output (deterministic)");
});

// =====================================================================
// SUMMARY
// =====================================================================
console.log("\n" + "=".repeat(70));
console.log(`  TESTS PASSED: ${passed}`);
console.log(`  TESTS FAILED: ${failed}`);
console.log("=".repeat(70));

if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  • ${f}`);
  }
  process.exit(1);
} else {
  console.log("\n✓ All tests passed.");
  process.exit(0);
}
