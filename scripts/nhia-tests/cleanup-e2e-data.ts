// Cleanup leftover E2E test data from the Neon DB
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.organization.findMany({ where: { name: { startsWith: "E2E Test Org" } } });
  console.log(`Found ${orgs.length} leftover E2E org(s)`);

  for (const org of orgs) {
    console.log(`  Cleaning org: ${org.name} (${org.id})`);
    // Delete audit logs first (they reference org/user/facility via plain FK strings)
    const al = await prisma.auditLog.deleteMany({ where: { organizationId: org.id } }).catch(() => null);
    if (al) console.log(`    Deleted ${al.count} audit logs`);

    // Delete users (must delete UserRole first)
    const users = await prisma.user.findMany({ where: { organizationId: org.id }, select: { id: true } });
    if (users.length > 0) {
      await prisma.userRole.deleteMany({ where: { userId: { in: users.map(u => u.id) } } }).catch(() => {});
      for (const u of users) {
        await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
      }
      console.log(`    Deleted ${users.length} users`);
    }

    // Delete patients
    const patients = await prisma.patient.findMany({ where: { organizationId: org.id }, select: { id: true } });
    if (patients.length > 0) {
      for (const p of patients) {
        await prisma.patientIdentifier.deleteMany({ where: { patientId: p.id } }).catch(() => {});
        await prisma.patientInsurance.deleteMany({ where: { patientId: p.id } }).catch(() => {});
        await prisma.patient.delete({ where: { id: p.id } }).catch(() => {});
      }
      console.log(`    Deleted ${patients.length} patients`);
    }

    // Delete facilities (must delete departments first)
    const facilities = await prisma.facility.findMany({ where: { organizationId: org.id }, select: { id: true } });
    for (const f of facilities) {
      await prisma.department.deleteMany({ where: { facilityId: f.id } }).catch(() => {});
      await prisma.facility.delete({ where: { id: f.id } }).catch(() => {});
    }
    if (facilities.length > 0) console.log(`    Deleted ${facilities.length} facilities`);

    // Finally delete the org
    await prisma.organization.delete({ where: { id: org.id } }).catch((e) => console.log(`    Could not delete org: ${e.message.slice(0, 100)}`));
  }

  console.log("Done");
  await prisma.$disconnect();
}
main();
