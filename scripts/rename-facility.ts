import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const updated = await prisma.facility.updateMany({
    where: { code: "JEM-KASOA" },
    data: {
      name: "Joy Emmanuel Hospital — Assin Fosu",
      code: "JEM-ASSIN",
      address: "Assin Fosu, Central Region",
      city: "Assin Fosu",
      email: "assin@joyemmanuelhospital.org",
    },
  });
  console.log(`Updated ${updated.count} facility from Kasoa → Assin Fosu`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
