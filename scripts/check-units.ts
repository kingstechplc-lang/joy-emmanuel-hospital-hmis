import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.unit.count();
  console.log("Total units in database:", count);
  if (count > 0) {
    const units = await prisma.unit.findMany({ take: 5, include: { department: { select: { name: true, code: true } } } });
    console.log("Sample units:", JSON.stringify(units, null, 2));
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
