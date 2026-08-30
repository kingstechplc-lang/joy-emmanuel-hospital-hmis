// =====================================================================
// Golden File Generator — produces sample-expected.xml from sample-ico.json
// using the ACTUAL XMLSerializer implementation.
//
// This script is idempotent: re-running it will produce byte-identical
// output (because the ICO fixture has stable dates and the serializer
// is deterministic).
//
// Run: npx tsx scripts/nhia-tests/generate-golden-xml.ts
// =====================================================================
import * as fs from "fs";
import * as path from "path";
import { serializeNHIAClaim } from "../../src/integrations/nhia/claim-it/serialization/XMLSerializer";
import type { IntermediateClaimsObject } from "../../src/integrations/nhia/claim-it/types/claims";

const FIXTURES_DIR = path.join(__dirname, "..", "..", "src", "integrations", "nhia", "claim-it", "__tests__", "fixtures");

function loadFixture(): IntermediateClaimsObject {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, "sample-ico.json"), "utf-8");
  const obj = JSON.parse(raw);
  // Revive dates
  if (obj.header?.generatedAt) obj.header.generatedAt = new Date(obj.header.generatedAt);
  if (obj.encounter?.visitDate) obj.encounter.visitDate = new Date(obj.encounter.visitDate);
  if (obj.encounter?.arrivalTime) obj.encounter.arrivalTime = new Date(obj.encounter.arrivalTime);
  if (obj.encounter?.admissionDate) obj.encounter.admissionDate = new Date(obj.encounter.admissionDate);
  if (obj.encounter?.dischargeDate) obj.encounter.dischargeDate = new Date(obj.encounter.dischargeDate);
  if (obj.encounter?.referralInfo?.referralDate) obj.encounter.referralInfo.referralDate = new Date(obj.encounter.referralInfo.referralDate);
  if (obj.patient?.dateOfBirth) obj.patient.dateOfBirth = new Date(obj.patient.dateOfBirth);
  if (obj.attendanceVerification?.verifiedAt) obj.attendanceVerification.verifiedAt = new Date(obj.attendanceVerification.verifiedAt);
  for (const s of obj.services || []) {
    if (s.serviceDate) s.serviceDate = new Date(s.serviceDate);
  }
  for (const d of obj.drugs || []) {
    if (d.dispensingDate) d.dispensingDate = new Date(d.dispensingDate);
  }
  return obj as IntermediateClaimsObject;
}

function main() {
  const ico = loadFixture();
  const xml = serializeNHIAClaim(ico);
  const outPath = path.join(FIXTURES_DIR, "sample-expected.xml");
  fs.writeFileSync(outPath, xml, "utf-8");
  console.log(`Golden XML written to: ${outPath}`);
  console.log(`Size: ${Buffer.byteLength(xml, "utf8")} bytes`);
  console.log(`Lines: ${xml.split("\n").length}`);
}

main();
