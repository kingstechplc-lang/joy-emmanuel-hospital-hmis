import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  // Find the records_officer role
  const role = await prisma.role.findFirst({ where: { code: "records_officer" } });
  if (!role) { console.log("records_officer role not found"); return; }

  // Delete existing permissions
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

  // Add the new set of permissions
  const permCodes = [
    "patient.view","patient.create","patient.edit","patient.merge","patient.export",
    "clinical.view","encounter.view","encounter.create",
    "billing.view","insurance.view",
    "document.upload","document.view","document.delete",
    "report.view","report.export",
    "task.assign","task.complete",
  ];

  let count = 0;
  for (const code of permCodes) {
    const p = await prisma.permission.findUnique({ where: { code } });
    if (p) {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
      count++;
    }
  }
  console.log(`Synced ${count} permissions to records_officer role`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
