import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();
async function main() {
  const u = await prisma.user.findUnique({
    where: { username: "superadmin" },
    select: { id: true, username: true, status: true, passwordHash: true, failedLoginAttempts: true, lockedUntil: true, email: true }
  });
  console.log("superadmin:", JSON.stringify(u, null, 2));
  if (u?.passwordHash) {
    const ok = await bcrypt.compare("Password@2026", u.passwordHash);
    console.log("Password matches:", ok);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
