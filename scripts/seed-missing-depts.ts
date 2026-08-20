import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding missing departments and units...");

  const org = await prisma.organization.findFirst({ where: { code: "JEM" } });
  if (!org) { console.log("Organization not found"); return; }

  const facilities = await prisma.facility.findMany({ where: { organizationId: org.id } });
  console.log(`Found ${facilities.length} facilities`);

  // 1. Add Home Care Services department
  let deptsCreated = 0;
  for (const facility of facilities) {
    const existing = await prisma.department.findFirst({
      where: { facilityId: facility.id, code: "HOMECARE" },
    });
    if (!existing) {
      await prisma.department.create({
        data: {
          facilityId: facility.id,
          name: "Home Care Services",
          code: "HOMECARE",
          category: "Nursing & Patient Care",
          description: "Home-based patient care services",
          status: "active",
        },
      });
      deptsCreated++;
    }
  }
  console.log(`✓ Created ${deptsCreated} Home Care departments`);

  // 2. Add MRI and Mammography units under Radiology
  let unitsCreated = 0;
  for (const facility of facilities) {
    const radDept = await prisma.department.findFirst({
      where: { facilityId: facility.id, code: "RAD" },
    });
    if (!radDept) continue;

    for (const u of [
      { code: "MRI", name: "MRI Unit", description: "Magnetic resonance imaging" },
      { code: "MAMMO", name: "Mammography Unit", description: "Breast imaging" },
    ]) {
      const existing = await prisma.unit.findFirst({
        where: { departmentId: radDept.id, code: u.code },
      });
      if (!existing) {
        await prisma.unit.create({
          data: {
            departmentId: radDept.id,
            name: u.name,
            code: u.code,
            description: u.description,
            status: "active",
          },
        });
        unitsCreated++;
      }
    }
  }
  console.log(`✓ Created ${unitsCreated} new units (MRI, Mammography)`);

  // 3. Add Serology/Immunology as a unit under Laboratory (if not already)
  let seroCreated = 0;
  for (const facility of facilities) {
    const labDept = await prisma.department.findFirst({
      where: { facilityId: facility.id, code: "LAB" },
    });
    if (!labDept) continue;

    const existing = await prisma.unit.findFirst({
      where: { departmentId: labDept.id, code: "SERO" },
    });
    if (!existing) {
      await prisma.unit.create({
        data: {
          departmentId: labDept.id,
          name: "Serology/Immunology Unit",
          code: "SERO",
          description: "HIV, Hepatitis, Widal, pregnancy tests, immunology",
          status: "active",
        },
      });
      seroCreated++;
    }
  }
  console.log(`✓ Serology/Immunology units: ${seroCreated} created`);

  // Summary
  const totalDepts = await prisma.department.count();
  const totalUnits = await prisma.unit.count();
  console.log(`\n📊 Final counts: ${totalDepts} departments, ${totalUnits} units`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
