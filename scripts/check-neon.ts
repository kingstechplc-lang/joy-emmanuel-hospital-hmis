import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const [orgs, facilities, users, roles, perms, patients, meds, invItems, labTests, services, suppliers] = await Promise.all([
    prisma.organization.count(),
    prisma.facility.count(),
    prisma.user.count(),
    prisma.role.count(),
    prisma.permission.count(),
    prisma.patient.count(),
    prisma.medication.count(),
    prisma.inventoryItem.count(),
    prisma.laboratoryTest.count(),
    prisma.service.count(),
    prisma.supplier.count(),
  ]);
  console.log("=== Neon Database State ===");
  console.log("Organizations:", orgs);
  console.log("Facilities:", facilities);
  console.log("Users:", users);
  console.log("Roles:", roles);
  console.log("Permissions:", perms);
  console.log("Patients:", patients);
  console.log("Medications:", meds);
  console.log("Inventory Items:", invItems);
  console.log("Lab Tests:", labTests);
  console.log("Services:", services);
  console.log("Suppliers:", suppliers);
}
main().catch(console.error).finally(() => prisma.$disconnect());
