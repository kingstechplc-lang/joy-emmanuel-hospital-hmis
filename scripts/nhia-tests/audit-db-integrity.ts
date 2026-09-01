// Operational audit: DB integrity queries against Neon DB.
// Read-only. Safe to run.
//
// Checks:
//   1. Duplicate NHIS providers (name ILIKE '%NHIS%' OR code ILIKE '%NHIS%')
//   2. Orphaned EncounterCoverage (encounterId doesn't exist)
//   3. EncounterCoverage with payerType='nhis' but patientInsuranceId IS NULL
//   4. (bonus) EncounterCoverage with payerType='nhis' but the linked
//      PatientInsurance.insuranceProvider has status != 'active'
//
// Run:  npx tsx scripts/nhia-tests/audit-db-integrity.ts
import { PrismaClient } from "@prisma/client";

const DATABASE_URL =
  "postgresql://neondb_owner:npg_cFAN93LwhkXs@ep-falling-firefly-ayrc50s1-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
  log: ["error"],
});

async function main() {
  console.log("\n=== NHIS/NHIA OPERATIONAL DB INTEGRITY AUDIT ===\n");
  await prisma.$connect();

  // ─── 1. Duplicate NHIS providers ────────────────────────────────────
  console.log("── 1. Duplicate NHIS InsuranceProviders ──");
  const nhisProviders: any[] = await prisma.$queryRaw`
    SELECT id, name, code, "providerType", status, "organizationId"
    FROM "InsuranceProvider"
    WHERE name ILIKE '%NHIS%' OR code ILIKE '%NHIS%'
    ORDER BY "organizationId", name
  `;
  console.log(`   Total providers matching 'NHIS': ${nhisProviders.length}`);
  // Group by organizationId + name to find duplicates
  const grouped: Record<string, any[]> = {};
  for (const p of nhisProviders) {
    const key = `${p.organizationId}::${p.name.toLowerCase()}::${p.code.toLowerCase()}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }
  const dupes = Object.entries(grouped).filter(([_, arr]) => arr.length > 1);
  console.log(`   Duplicate (same org+name+code) groups: ${dupes.length}`);
  for (const [key, arr] of dupes) {
    console.log(`   ✗ DUPLICATE: ${key}`);
    for (const p of arr) {
      console.log(`       - id=${p.id} name="${p.name}" code="${p.code}" type=${p.providerType} status=${p.status}`);
    }
  }
  // Also list ALL nhis providers per org for context
  const byOrg: Record<string, any[]> = {};
  for (const p of nhisProviders) {
    if (!byOrg[p.organizationId]) byOrg[p.organizationId] = [];
    byOrg[p.organizationId].push(p);
  }
  console.log("   NHIS providers per organization:");
  for (const [orgId, arr] of Object.entries(byOrg)) {
    console.log(`     org=${orgId}: ${arr.length} provider(s)`);
    for (const p of arr) {
      console.log(`       - name="${p.name}" code="${p.code}" type=${p.providerType} status=${p.status}`);
    }
  }

  // ─── 2. Orphaned EncounterCoverage ──────────────────────────────────
  console.log("\n── 2. Orphaned EncounterCoverage (encounterId not in Encounter) ──");
  const orphanedCoverage: any[] = await prisma.$queryRaw`
    SELECT ec.id, ec."encounterId", ec."organizationId", ec."payerType", ec.status
    FROM "EncounterCoverage" ec
    LEFT JOIN "Encounter" e ON e.id = ec."encounterId"
    WHERE e.id IS NULL
  `;
  console.log(`   Orphaned EncounterCoverage rows: ${orphanedCoverage.length}`);
  for (const c of orphanedCoverage.slice(0, 20)) {
    console.log(`   ✗ orphan: id=${c.id} encounterId=${c.encounterId} payer=${c.payerType} status=${c.status}`);
  }

  // ─── 3. EncounterCoverage with payerType='nhis' but NULL patientInsuranceId ──
  console.log("\n── 3. EncounterCoverage payerType='nhis' but patientInsuranceId IS NULL ──");
  const nhisNoPi: any[] = await prisma.$queryRaw`
    SELECT id, "encounterId", "organizationId", "insuranceProviderId",
           "coveragePercentage", status, "selectedAt"
    FROM "EncounterCoverage"
    WHERE "payerType" = 'nhis' AND "patientInsuranceId" IS NULL
    ORDER BY "selectedAt" DESC
    LIMIT 50
  `;
  console.log(`   Count: ${nhisNoPi.length}${nhisNoPi.length >= 50 ? " (capped at 50)" : ""}`);
  for (const c of nhisNoPi.slice(0, 20)) {
    console.log(`   ✗ nhis/no-pi: id=${c.id} encounterId=${c.encounterId} providerId=${c.insuranceProviderId || "—"} cov%=${c.coveragePercentage} status=${c.status} at=${c.selectedAt?.toISOString?.() || c.selectedAt}`);
  }

  // ─── 4. (bonus) NHIS coverage where linked provider is NOT active ──
  console.log("\n── 4. (bonus) NHIS EncounterCoverage where InsuranceProvider.status != 'active' ──");
  const inactiveProviderCoverage: any[] = await prisma.$queryRaw`
    SELECT ec.id AS coverage_id, ec."encounterId", ip.name AS provider_name,
           ip.code AS provider_code, ip.status AS provider_status
    FROM "EncounterCoverage" ec
    JOIN "PatientInsurance" pi ON pi.id = ec."patientInsuranceId"
    JOIN "InsuranceProvider" ip ON ip.id = pi."insuranceProviderId"
    WHERE ec."payerType" = 'nhis' AND ip.status <> 'active'
    LIMIT 50
  `;
  console.log(`   Count: ${inactiveProviderCoverage.length}${inactiveProviderCoverage.length >= 50 ? " (capped at 50)" : ""}`);
  for (const c of inactiveProviderCoverage.slice(0, 20)) {
    console.log(`   ✗ inactive-provider: coverageId=${c.coverage_id} encounterId=${c.encounterId} provider="${c.provider_name}" (${c.provider_code}) status=${c.provider_status}`);
  }

  // ─── 5. (bonus) PatientInsurance where the provider status != 'active' ──
  console.log("\n── 5. (bonus) Active PatientInsurance records referencing inactive providers ──");
  const piOnInactive: any[] = await prisma.$queryRaw`
    SELECT pi.id, pi."patientId", pi.status AS pi_status, pi."verificationStatus",
           ip.name AS provider_name, ip.code AS provider_code, ip.status AS provider_status
    FROM "PatientInsurance" pi
    JOIN "InsuranceProvider" ip ON ip.id = pi."insuranceProviderId"
    WHERE pi.status = 'active' AND ip.status <> 'active'
    LIMIT 50
  `;
  console.log(`   Count: ${piOnInactive.length}${piOnInactive.length >= 50 ? " (capped at 50)" : ""}`);
  for (const c of piOnInactive.slice(0, 20)) {
    console.log(`   ✗ active-pi/inactive-provider: piId=${c.id} patientId=${c.patientId} piStatus=${c.pi_status} verif=${c.verificationStatus} provider="${c.provider_name}" providerStatus=${c.provider_status}`);
  }

  console.log("\n=== AUDIT COMPLETE ===\n");
}

main()
  .catch((e) => {
    console.error("✗ ERROR:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
