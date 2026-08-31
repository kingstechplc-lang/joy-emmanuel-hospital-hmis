// Fix the NHIS provider data inconsistency — providerType should be 'nhis', not 'private'
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Find NHIS-named providers with wrong providerType
  const inconsistent = await prisma.insuranceProvider.findMany({
    where: {
      OR: [
        { name: { contains: "NHIS", mode: "insensitive" } },
        { name: { contains: "National Health Insurance", mode: "insensitive" } },
        { code: { contains: "NHIS", mode: "insensitive" } },
      ],
      providerType: { not: "nhis" },
    },
  });

  console.log(`Found ${inconsistent.length} inconsistent NHIS provider(s):\n`);
  for (const p of inconsistent) {
    console.log(`  ${p.name} (${p.code})`);
    console.log(`    Current providerType: ${p.providerType}`);
    console.log(`    Correcting to: nhis`);
  }

  // Fix them
  for (const p of inconsistent) {
    await prisma.insuranceProvider.update({
      where: { id: p.id },
      data: { providerType: "nhis" },
    });
    console.log(`  ✓ Fixed: ${p.name} (${p.code}) → providerType=nhis`);
  }

  // Verify
  console.log("\n=== Verification ===");
  const fixed = await prisma.insuranceProvider.findUnique({
    where: { id: "cmstwzlhm00kgu83xz435c3nz" },
    select: { name: true, code: true, providerType: true, status: true },
  });
  console.log(`  ${fixed?.name} (${fixed?.code}) — providerType=${fixed?.providerType}, status=${fixed?.status}`);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
