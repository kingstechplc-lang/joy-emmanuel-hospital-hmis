import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const updated = await prisma.facility.updateMany({
    where: { code: "JEM-ASSIN FOSU" },
    data: { code: "JEM-ASSIN" },
  });
  console.log(`Updated ${updated.count} facility code: JEM-ASSIN FOSU → JEM-ASSIN`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
