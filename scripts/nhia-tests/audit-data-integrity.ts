// Comprehensive data integrity audit against Neon DB
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("=== DATA INTEGRITY AUDIT ===\n");

  // 1. Duplicate NHIS providers
  const nhisProviders = await prisma.insuranceProvider.findMany({
    where: { OR: [
      { name: { contains: "NHIS", mode: "insensitive" } },
      { code: { contains: "NHIS", mode: "insensitive" } },
    ]},
    select: { id: true, name: true, code: true, providerType: true, status: true, organizationId: true },
  });
  console.log(`1. NHIS providers: ${nhisProviders.length} found`);
  nhisProviders.forEach(p => console.log(`   ${p.name} (${p.code}) type=${p.providerType} status=${p.status}`));
  console.log(`   ${nhisProviders.length > 1 ? "DUPLICATE!" : "OK"}`);

  // 2. Orphaned EncounterCoverage
  const orphanedCoverage = await prisma.$queryRaw`
    SELECT COUNT(*)::int as cnt FROM "EncounterCoverage" ec
    LEFT JOIN "Encounter" e ON ec."encounterId" = e.id
    WHERE e.id IS NULL
  ` as any;
  console.log(`\n2. Orphaned EncounterCoverage: ${orphanedCoverage[0]?.cnt || 0} ${orphanedCoverage[0]?.cnt > 0 ? "ORPHANS!" : "OK"}`);

  // 3. EncounterCoverage with nhis payer but no patientInsuranceId
  const nhisNoInsurance = await prisma.$queryRaw`
    SELECT COUNT(*)::int as cnt FROM "EncounterCoverage"
    WHERE "payerType" = 'nhis' AND "patientInsuranceId" IS NULL
  ` as any;
  console.log(`\n3. NHIS coverage without PatientInsurance link: ${nhisNoInsurance[0]?.cnt || 0} ${nhisNoInsurance[0]?.cnt > 0 ? "ISSUE!" : "OK"}`);

  // 4. Active PatientInsurance referencing inactive provider
  const activeInsInactiveProvider = await prisma.$queryRaw`
    SELECT COUNT(*)::int as cnt FROM "PatientInsurance" pi
    JOIN "InsuranceProvider" ip ON pi."insuranceProviderId" = ip.id
    WHERE pi.status = 'active' AND ip.status != 'active'
  ` as any;
  console.log(`\n4. Active insurance with inactive provider: ${activeInsInactiveProvider[0]?.cnt || 0} ${activeInsInactiveProvider[0]?.cnt > 0 ? "ISSUE!" : "OK"}`);

  // 5. Claims without encounters
  const claimsNoEncounter = await prisma.insuranceClaim.count({
    where: { encounterId: null },
  });
  console.log(`\n5. Claims without encounterId: ${claimsNoEncounter} ${claimsNoEncounter > 0 ? "REVIEW" : "OK"}`);

  // 6. XML exports without valid encounter
  const exportsNoEncounter = await prisma.$queryRaw`
    SELECT COUNT(*)::int as cnt FROM "NhiaClaimExport" ne
    LEFT JOIN "Encounter" e ON ne."encounterId" = e.id
    WHERE e.id IS NULL
  ` as any;
  console.log(`\n6. XML exports without encounter: ${exportsNoEncounter[0]?.cnt || 0} ${exportsNoEncounter[0]?.cnt > 0 ? "ORPHANS!" : "OK"}`);

  // 7. Claims with invalid payer references
  const claimsInvalidProvider = await prisma.$queryRaw`
    SELECT COUNT(*)::int as cnt FROM "InsuranceClaim" ic
    LEFT JOIN "InsuranceProvider" ip ON ic."insuranceProviderId" = ip.id
    WHERE ip.id IS NULL AND ic."insuranceProviderId" IS NOT NULL
  ` as any;
  console.log(`\n7. Claims with invalid provider ref: ${claimsInvalidProvider[0]?.cnt || 0} ${claimsInvalidProvider[0]?.cnt > 0 ? "ISSUE!" : "OK"}`);

  console.log("\n=== AUDIT COMPLETE ===");
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
