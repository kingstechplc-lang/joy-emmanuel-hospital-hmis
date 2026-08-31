// Audit InsuranceProvider data — find NHIS providers and check providerType consistency
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("=== All Insurance Providers ===\n");
  const providers = await prisma.insuranceProvider.findMany({
    include: {
      _count: { select: { patientInsurance: true, insuranceClaims: true } },
    },
    orderBy: { name: "asc" },
  });

  for (const p of providers) {
    const looksLikeNhis = /nhis|national health insurance/i.test(p.name) || /nhis/i.test(p.code);
    const marker = looksLikeNhis && p.providerType !== "nhis" ? " ⚠️ INCONSISTENT" : "";
    console.log(`  ${p.id}`);
    console.log(`    name: ${p.name}`);
    console.log(`    code: ${p.code}`);
    console.log(`    providerType: ${p.providerType}${marker}`);
    console.log(`    status: ${p.status}`);
    console.log(`    organizationId: ${p.organizationId}`);
    console.log(`    patients: ${p._count.patientInsurance} | claims: ${p._count.insuranceClaims}`);
    console.log();
  }

  // Specifically flag NHIS-named providers with wrong providerType
  const inconsistent = providers.filter(p =>
    (/nhis|national health insurance/i.test(p.name) || /nhis/i.test(p.code)) && p.providerType !== "nhis"
  );
  console.log(`\n=== INCONSISTENT PROVIDERS (${inconsistent.length}) ===`);
  for (const p of inconsistent) {
    console.log(`  ${p.name} (${p.code}) — providerType=${p.providerType}, should be 'nhis'`);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
