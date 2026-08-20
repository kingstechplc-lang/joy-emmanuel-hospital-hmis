import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const units = await prisma.unit.findMany({
    take: 10,
    include: { department: { select: { name: true, code: true, facility: { select: { name: true } } } } },
  });
  console.log("=== Sample Units ===");
  units.forEach(u => {
    console.log(`  ${u.department.code} → ${u.code}: ${u.name} (${u.department.facility.name}) — ${u.status}`);
  });
}
main().catch(console.error).finally(() => prisma.$disconnect());
