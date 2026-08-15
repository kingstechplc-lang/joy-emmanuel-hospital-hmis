import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const [departments, wards, rooms, beds, staff, staffFacilities, userRoles, rolePerms, facilityInv, batches, txn, insProviders, patientIns, allergies, medHist, patIdentifiers, patContacts] = await Promise.all([
    prisma.department.count(),
    prisma.ward.count(),
    prisma.room.count(),
    prisma.bed.count(),
    prisma.staff.count(),
    prisma.staffFacility.count(),
    prisma.userRole.count(),
    prisma.rolePermission.count(),
    prisma.facilityInventory.count(),
    prisma.inventoryBatch.count(),
    prisma.inventoryTransaction.count(),
    prisma.insuranceProvider.count(),
    prisma.patientInsurance.count(),
    prisma.allergy.count(),
    prisma.medicalHistory.count(),
    prisma.patientIdentifier.count(),
    prisma.patientContact.count(),
  ]);
  console.log("=== Neon Database — Full State ===");
  console.log("Departments:", departments);
  console.log("Wards:", wards);
  console.log("Rooms:", rooms);
  console.log("Beds:", beds);
  console.log("Staff:", staff);
  console.log("Staff Facility Assignments:", staffFacilities);
  console.log("User-Role assignments:", userRoles);
  console.log("Role-Permission assignments:", rolePerms);
  console.log("Facility Inventory records:", facilityInv);
  console.log("Inventory Batches:", batches);
  console.log("Inventory Transactions:", txn);
  console.log("Insurance Providers:", insProviders);
  console.log("Patient Insurance:", patientIns);
  console.log("Allergies:", allergies);
  console.log("Medical History:", medHist);
  console.log("Patient Identifiers:", patIdentifiers);
  console.log("Patient Contacts:", patContacts);
}
main().catch(console.error).finally(() => prisma.$disconnect());
