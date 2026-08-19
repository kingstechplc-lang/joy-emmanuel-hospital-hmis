import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding units...");

  const org = await prisma.organization.findFirst({ where: { code: "JEM" } });
  if (!org) { console.log("Organization not found"); return; }

  const facilities = await prisma.facility.findMany({ where: { organizationId: org.id } });
  console.log(`Found ${facilities.length} facilities`);

  const unitsByDeptCode: Record<string, Array<{ code: string; name: string; description?: string }>> = {
    LAB: [
      { code: "HEMA", name: "Haematology Unit", description: "Blood tests, CBC, ESR, coagulation" },
      { code: "CHEM", name: "Clinical Chemistry Unit", description: "Blood glucose, LFT, KFT, lipids" },
      { code: "MICRO", name: "Microbiology Unit", description: "Stool, urine, wound cultures" },
      { code: "SERO", name: "Serology Unit", description: "HIV, Hepatitis, Widal, pregnancy tests" },
    ],
    PHARM: [
      { code: "INPAT", name: "Inpatient Pharmacy", description: "Medication for admitted patients" },
      { code: "OUTPAT", name: "Outpatient Pharmacy", description: "Medication for OPD patients" },
    ],
    RAD: [
      { code: "XRAY", name: "X-Ray Unit", description: "General radiography" },
      { code: "US", name: "Ultrasound Unit", description: "Ultrasonography" },
      { code: "CT", name: "CT Scan Unit", description: "Computed tomography" },
    ],
    OPD: [
      { code: "GEN", name: "General Consultation", description: "General outpatient consultations" },
      { code: "FUP", name: "Follow-up Clinic", description: "Review and follow-up visits" },
    ],
    SURG: [
      { code: "GENS", name: "General Surgery Unit", description: "General surgical procedures" },
      { code: "ORTHO", name: "Orthopaedics Unit", description: "Bone and joint surgery" },
    ],
    MAT: [
      { code: "ANT", name: "Antenatal Unit", description: "Antenatal care and monitoring" },
      { code: "LABOUR", name: "Labour Ward", description: "Labour and delivery" },
      { code: "POST", name: "Postnatal Unit", description: "Postnatal care" },
    ],
    THEATRE: [
      { code: "MAJOR", name: "Major Theatre", description: "Major surgical procedures" },
      { code: "MINOR", name: "Minor Theatre", description: "Minor surgical procedures" },
    ],
    MED: [
      { code: "CARD", name: "Cardiology Unit", description: "Heart and cardiovascular" },
      { code: "NEURO", name: "Neurology Unit", description: "Nervous system disorders" },
      { code: "ENDO", name: "Endocrinology Unit", description: "Diabetes and hormonal disorders" },
    ],
    PAED: [
      { code: "GENP", name: "General Paediatrics", description: "General child health" },
      { code: "NEONATAL", name: "Neonatal Unit", description: "Newborn care" },
    ],
    NURS: [
      { code: "GENN", name: "General Nursing", description: "General nursing care" },
      { code: "ICUN", name: "ICU Nursing", description: "Critical care nursing" },
    ],
    EMERG: [
      { code: "TRIAGE", name: "Triage Unit", description: "Emergency triage and assessment" },
      { code: "RESUS", name: "Resuscitation Unit", description: "Emergency resuscitation" },
    ],
    FIN: [
      { code: "BILLING", name: "Billing Unit", description: "Patient billing" },
      { code: "PAYMENTS", name: "Payments Unit", description: "Payment collection" },
    ],
  };

  let unitsCreated = 0;
  for (const facility of facilities) {
    for (const [deptCode, units] of Object.entries(unitsByDeptCode)) {
      const dept = await prisma.department.findFirst({
        where: { facilityId: facility.id, code: deptCode },
      });
      if (!dept) continue;

      for (const u of units) {
        const existing = await prisma.unit.findFirst({
          where: { departmentId: dept.id, code: u.code },
        });
        if (existing) continue;

        await prisma.unit.create({
          data: {
            departmentId: dept.id,
            name: u.name,
            code: u.code,
            description: u.description || null,
            status: "active",
          },
        });
        unitsCreated++;
      }
    }
  }
  console.log(`✓ Created ${unitsCreated} units`);

  const total = await prisma.unit.count();
  console.log(`Total units in database: ${total}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
