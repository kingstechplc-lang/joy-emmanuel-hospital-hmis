// =====================================================================
// SEED: Vaccine Catalog + Schedule Doses (WHO EPI antigens)
// =====================================================================
// Run with: npx tsx scripts/seed-vaccine-catalog.ts
//
// Creates the standard WHO EPI vaccine catalog with schedule rules for
// children from birth through 18 months. Idempotent — skips vaccines that
// already exist (by org+code).
// =====================================================================
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
config({ path: ".env", override: true });

const db = new PrismaClient();

async function main() {
  const orgId = process.argv[2];
  if (!orgId) {
    console.error("Usage: npx tsx scripts/seed-vaccine-catalog.ts <organizationId>");
    console.error("   or: ORGANIZATION_ID=<id> npx tsx scripts/seed-vaccine-catalog.ts");
    process.exit(1);
  }

  console.log(`Seeding vaccine catalog for organization: ${orgId}`);

  const VACCINES = [
    {
      code: "BCG",
      name: "BCG Vaccine",
      genericName: "Bacille Calmette-Guérin",
      diseasePrevented: "Tuberculosis",
      vaccineType: "routine_childhood",
      ageGroup: "birth",
      defaultRoute: "Intradermal",
      defaultSite: "Right upper arm",
      doseVolumeMl: 0.05,
      totalDosesInSeries: 1,
      scheduleDoses: [
        { doseNumber: 1, doseLabel: "Birth dose", ageAtDueDays: 0, ageAtOverdueDays: 14 },
      ],
    },
    {
      code: "OPV",
      name: "Oral Polio Vaccine",
      genericName: "Oral Poliovirus Vaccine",
      diseasePrevented: "Poliomyelitis",
      vaccineType: "routine_childhood",
      ageGroup: "birth",
      defaultRoute: "Oral",
      defaultSite: "Oral",
      doseVolumeMl: 2,
      totalDosesInSeries: 4,
      scheduleDoses: [
        { doseNumber: 1, doseLabel: "Birth dose (OPV-0)", ageAtDueDays: 0, ageAtOverdueDays: 14 },
        { doseNumber: 2, doseLabel: "OPV-1 (6 weeks)", ageAtDueDays: 42, ageAtOverdueDays: 70, intervalFromPreviousDoseDays: 28 },
        { doseNumber: 3, doseLabel: "OPV-2 (10 weeks)", ageAtDueDays: 70, ageAtOverdueDays: 98, intervalFromPreviousDoseDays: 28 },
        { doseNumber: 4, doseLabel: "OPV-3 (14 weeks)", ageAtDueDays: 98, ageAtOverdueDays: 126, intervalFromPreviousDoseDays: 28 },
      ],
    },
    {
      code: "PENTA",
      name: "Pentavalent Vaccine (DTP-HepB-Hib)",
      genericName: "Diphtheria, Tetanus, Pertussis, Hepatitis B, Haemophilus influenzae type b",
      diseasePrevented: "Diphtheria, Tetanus, Pertussis, Hepatitis B, Hib",
      vaccineType: "routine_childhood",
      ageGroup: "under_1",
      defaultRoute: "IM",
      defaultSite: "Left anterolateral thigh",
      doseVolumeMl: 0.5,
      totalDosesInSeries: 3,
      scheduleDoses: [
        { doseNumber: 1, doseLabel: "Penta-1 (6 weeks)", ageAtDueDays: 42, ageAtOverdueDays: 70 },
        { doseNumber: 2, doseLabel: "Penta-2 (10 weeks)", ageAtDueDays: 70, ageAtOverdueDays: 98, intervalFromPreviousDoseDays: 28 },
        { doseNumber: 3, doseLabel: "Penta-3 (14 weeks)", ageAtDueDays: 98, ageAtOverdueDays: 126, intervalFromPreviousDoseDays: 28 },
      ],
    },
    {
      code: "ROTA",
      name: "Rotavirus Vaccine",
      genericName: "Rotavirus Vaccine",
      diseasePrevented: "Rotavirus gastroenteritis",
      vaccineType: "routine_childhood",
      ageGroup: "under_1",
      defaultRoute: "Oral",
      defaultSite: "Oral",
      doseVolumeMl: 1.5,
      totalDosesInSeries: 2,
      scheduleDoses: [
        { doseNumber: 1, doseLabel: "Rota-1 (6 weeks)", ageAtDueDays: 42, ageAtOverdueDays: 70 },
        { doseNumber: 2, doseLabel: "Rota-2 (10 weeks)", ageAtDueDays: 70, ageAtOverdueDays: 98, intervalFromPreviousDoseDays: 28 },
      ],
    },
    {
      code: "PCV",
      name: "Pneumococcal Conjugate Vaccine",
      genericName: "Pneumococcal Conjugate Vaccine (PCV13)",
      diseasePrevented: "Pneumococcal disease",
      vaccineType: "routine_childhood",
      ageGroup: "under_1",
      defaultRoute: "IM",
      defaultSite: "Right anterolateral thigh",
      doseVolumeMl: 0.5,
      totalDosesInSeries: 3,
      scheduleDoses: [
        { doseNumber: 1, doseLabel: "PCV-1 (6 weeks)", ageAtDueDays: 42, ageAtOverdueDays: 70 },
        { doseNumber: 2, doseLabel: "PCV-2 (10 weeks)", ageAtDueDays: 70, ageAtOverdueDays: 98, intervalFromPreviousDoseDays: 28 },
        { doseNumber: 3, doseLabel: "PCV-3 (14 weeks)", ageAtDueDays: 98, ageAtOverdueDays: 126, intervalFromPreviousDoseDays: 28 },
      ],
    },
    {
      code: "MR",
      name: "Measles-Rubella Vaccine",
      genericName: "Measles-Rubella Vaccine",
      diseasePrevented: "Measles, Rubella",
      vaccineType: "routine_childhood",
      ageGroup: "under_1",
      defaultRoute: "SC",
      defaultSite: "Right upper arm",
      doseVolumeMl: 0.5,
      totalDosesInSeries: 2,
      scheduleDoses: [
        { doseNumber: 1, doseLabel: "MR-1 (9 months)", ageAtDueDays: 274, ageAtOverdueDays: 365 },
        { doseNumber: 2, doseLabel: "MR-2 (18 months)", ageAtDueDays: 548, ageAtOverdueDays: 640, intervalFromPreviousDoseDays: 274 },
      ],
    },
    {
      code: "HPV",
      name: "Human Papillomavirus Vaccine",
      genericName: "HPV Vaccine",
      diseasePrevented: "Cervical cancer, HPV-related diseases",
      vaccineType: "adolescent",
      ageGroup: "adolescent",
      defaultRoute: "IM",
      defaultSite: "Left deltoid",
      doseVolumeMl: 0.5,
      totalDosesInSeries: 2,
      scheduleDoses: [
        { doseNumber: 1, doseLabel: "HPV-1 (9-14 years, dose 1)", ageAtDueDays: 3285, ageAtOverdueDays: 3650, appliesToSex: "female" },
        { doseNumber: 2, doseLabel: "HPV-2 (6-12 months after dose 1)", ageAtDueDays: 3460, ageAtOverdueDays: 4015, intervalFromPreviousDoseDays: 150, appliesToSex: "female" },
      ],
    },
    {
      code: "TT",
      name: "Tetanus Toxoid Vaccine",
      genericName: "Tetanus Toxoid",
      diseasePrevented: "Tetanus",
      vaccineType: "maternal",
      ageGroup: "maternal",
      defaultRoute: "IM",
      defaultSite: "Left upper arm",
      doseVolumeMl: 0.5,
      totalDosesInSeries: 5,
      scheduleDoses: [],
    },
    {
      code: "HEPB_BIRTH",
      name: "Hepatitis B Birth Dose",
      genericName: "Hepatitis B Vaccine (birth dose)",
      diseasePrevented: "Hepatitis B",
      vaccineType: "routine_childhood",
      ageGroup: "birth",
      defaultRoute: "IM",
      defaultSite: "Anterolateral thigh",
      doseVolumeMl: 0.5,
      totalDosesInSeries: 1,
      scheduleDoses: [
        { doseNumber: 1, doseLabel: "Birth dose (within 24 hours)", ageAtDueDays: 0, ageAtOverdueDays: 1 },
      ],
    },
    {
      code: "YF",
      name: "Yellow Fever Vaccine",
      genericName: "Yellow Fever Vaccine",
      diseasePrevented: "Yellow Fever",
      vaccineType: "routine_childhood",
      ageGroup: "under_1",
      defaultRoute: "SC",
      defaultSite: "Left upper arm",
      doseVolumeMl: 0.5,
      totalDosesInSeries: 1,
      scheduleDoses: [
        { doseNumber: 1, doseLabel: "Yellow Fever (9 months)", ageAtDueDays: 274, ageAtOverdueDays: 365 },
      ],
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const v of VACCINES) {
    const existing = await db.vaccineCatalog.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: v.code } },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const vaccine = await db.vaccineCatalog.create({
      data: {
        organizationId: orgId,
        code: v.code,
        name: v.name,
        genericName: v.genericName,
        diseasePrevented: v.diseasePrevented,
        vaccineType: v.vaccineType,
        ageGroup: v.ageGroup,
        defaultRoute: v.defaultRoute,
        defaultSite: v.defaultSite,
        doseVolumeMl: v.doseVolumeMl,
        totalDosesInSeries: v.totalDosesInSeries,
        isActive: true,
      },
    });

    for (const dose of v.scheduleDoses) {
      await db.vaccineScheduleDose.create({
        data: {
          organizationId: orgId,
          vaccineCatalogId: vaccine.id,
          doseNumber: dose.doseNumber,
          doseLabel: dose.doseLabel,
          ageAtDueDays: dose.ageAtDueDays,
          ageAtOverdueDays: dose.ageAtOverdueDays,
          intervalFromPreviousDoseDays: (dose as any).intervalFromPreviousDoseDays || null,
          appliesToSex: (dose as any).appliesToSex || null,
          isActive: true,
        },
      });
    }
    created++;
    console.log(`  ✅ Created ${v.code} (${v.name}) with ${v.scheduleDoses.length} schedule doses`);
  }

  console.log(`\nDone. Created: ${created}, Skipped (already exist): ${skipped}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
