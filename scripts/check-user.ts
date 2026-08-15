import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const u = await prisma.user.findUnique({ where: { username: "superadmin" }, select: { id: true, username: true, status: true, passwordHash: true, failedLoginAttempts: true, lockedUntil: true } });
  console.log("superadmin user:", JSON.stringify(u, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
