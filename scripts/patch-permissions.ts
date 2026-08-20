// =====================================================================
// PATCH SCRIPT — Add new extended module permissions to existing roles
// =====================================================================
// Run this after adding new permissions to permissions.ts to ensure
// existing roles get the new permissions without re-running the full
// seed (which can be slow over remote DB connections).
// =====================================================================
import { config } from "dotenv";
config({ override: true });
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  console.log("🔧 Patching permissions...");

  // 1. Ensure all permissions exist
  const allPerms = Object.values(PERMISSIONS);
  console.log(`• Ensuring ${allPerms.length} permissions exist`);
  for (const code of allPerms) {
    await prisma.permission.upsert({
      where: { code: code as string },
      update: {},
      create: {
        code: code as string,
        name: (code as string).replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        module: (code as string).split(".")[0],
      },
    });
  }
  console.log("✓ Permissions synced");

  // 2. Get all permissions by code
  const perms = await prisma.permission.findMany();
  const permByCode: Record<string, any> = {};
  for (const p of perms) permByCode[p.code] = p;

  // 3. For each role, ensure the right permissions are assigned
  const rolesData = Object.entries(ROLE_PERMISSIONS);
  console.log(`• Syncing permissions for ${rolesData.length} roles`);

  // Get all organizations
  const orgs = await prisma.organization.findMany();
  console.log(`• Found ${orgs.length} organizations`);

  for (const org of orgs) {
    for (const [roleCode, rolePerms] of rolesData) {
      const role = await prisma.role.findFirst({
        where: { organizationId: org.id, code: roleCode },
      });
      if (!role) {
        console.log(`  ! Role ${roleCode} not found in org ${org.code}, skipping`);
        continue;
      }

      // Get currently assigned permissions
      const existingAssignments = await prisma.rolePermission.findMany({
        where: { roleId: role.id },
        select: { permissionId: true },
      });
      const existingPermIds = new Set(existingAssignments.map((a) => a.permissionId));

      // Find missing permissions
      const missingPerms = rolePerms
        .map((code) => permByCode[code as string])
        .filter((p) => p && !existingPermIds.has(p.id));

      if (missingPerms.length > 0) {
        await prisma.rolePermission.createMany({
          data: missingPerms.map((p: any) => ({ roleId: role.id, permissionId: p.id })),
          skipDuplicates: true,
        });
        console.log(`  ✓ ${org.code}/${roleCode}: +${missingPerms.length} new permissions`);
      }
    }
  }

  // 4. Done — user permissions are computed from roles at login time
  console.log("✅ Done. User permissions will be refreshed on next sign-in.");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
