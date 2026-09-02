#!/usr/bin/env tsx
// =====================================================================
// Secure Password Reset Script
// =====================================================================
// Resets a user's password and optionally forces a password change
// on next login.
//
// Usage:
//   npx tsx scripts/reset-password.ts <username> [options]
//
// Options:
//   --new-password=<password>   Set a specific password (default: random)
//   --force-change              Force password change on next login
//   --list                      List all usernames (no changes made)
//
// Examples:
//   npx tsx scripts/reset-password.ts admin --force-change
//   npx tsx scripts/reset-password.ts doctor --new-password=TempPass123
//   npx tsx scripts/reset-password.ts --list
// =====================================================================
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as crypto from "crypto";

const prisma = new PrismaClient();

function generateRandomPassword(length: number = 16): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let password = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

async function main() {
  const args = process.argv.slice(2);

  // --list mode: show all usernames
  if (args.includes("--list")) {
    const users = await prisma.user.findMany({
      select: { username: true, firstName: true, lastName: true, status: true, mustChangePassword: true },
      orderBy: { username: "asc" },
    });
    console.log("\n=== All Users ===\n");
    console.log("Username".padEnd(20) + "Name".padEnd(30) + "Status".padEnd(10) + "MustChange");
    console.log("-".repeat(75));
    for (const u of users) {
      console.log(
        u.username.padEnd(20) +
        `${u.firstName} ${u.lastName}`.padEnd(30) +
        u.status.padEnd(10) +
        (u.mustChangePassword ? "YES" : "no")
      );
    }
    await prisma.$disconnect();
    return;
  }

  const username = args.find((a) => !a.startsWith("--"));
  if (!username) {
    console.error("Usage: npx tsx scripts/reset-password.ts <username> [--new-password=<pw>] [--force-change] [--list]");
    process.exit(1);
  }

  const forceChange = args.includes("--force-change");
  const newPasswordArg = args.find((a) => a.startsWith("--new-password="));
  const newPassword = newPasswordArg
    ? newPasswordArg.split("=")[1]
    : generateRandomPassword(16);

  if (newPassword.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`User "${username}" not found.`);
    process.exit(1);
  }

  console.log(`\nResetting password for: ${user.username} (${user.firstName} ${user.lastName})`);

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashedPassword,
      passwordChangedAt: new Date(),
      mustChangePassword: forceChange,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  console.log(`\n  Password reset successfully.`);
  console.log(`  New password:      ${newPassword}`);
  console.log(`  Force change:     ${forceChange ? "YES (user must change on next login)" : "no"}`);
  console.log(`  Account unlocked:  yes (failedLoginAttempts cleared, lockUntil cleared)`);
  console.log(`\n  ⚠️  Store this password securely. It will not be shown again.`);
  console.log(`\n  Next step: share the temporary password with the user.`);

  if (forceChange) {
    console.log(`  The user will be redirected to /change-password on next login.`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
