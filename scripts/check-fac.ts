import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const all = await prisma.facility.findMany({ select: { id: true, name: true, code: true, city: true } });
  console.log(JSON.stringify(all, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
