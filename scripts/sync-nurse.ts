import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const role = await prisma.role.findFirst({ where: { code: "nurse" } });
  if (!role) { console.log("nurse role not found"); return; }
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

  const permCodes = [
    "patient.view",
    "clinical.view","clinical.edit",
    "encounter.view",
    "triage.view","triage.record","vitals.record",
    "lab.view","lab.collect",
    "pharmacy.view",
    "admission.view","bed.manage",
    "procedure.view",
    "billing.view",
    "task.assign","task.complete",
    "document.upload","document.view",
  ];

  let count = 0;
  for (const code of permCodes) {
    const p = await prisma.permission.findUnique({ where: { code } });
    if (p) {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
      count++;
    }
  }
  console.log(`Synced ${count} permissions to nurse role (removed clinical.create)`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
