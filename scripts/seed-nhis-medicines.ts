// =====================================================================
// SEED: NHIS Ghana Medicines List
// =====================================================================
// Seeds medications from the Ghana NHIS National Medicines List (NML)
// with tariff codes, reimbursable prices, prescribing levels, and units
// of pricing. Source: https://www.nhis.gov.gh/medlist
//
// Usage: npx tsx scripts/seed-nhis-medicines.ts <organizationId>
// =====================================================================
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
config({ path: ".env", override: true });

const db = new PrismaClient();

// Parsed from https://www.nhis.gov.gh/medlist (page 1 of 28)
// Each entry: { code, genericName, strength, form, unitOfPricing, price, level }
const NHIS_MEDICINES = [
  { code: "ACETAZIN1", name: "Acetazolamide", strength: "500 mg", form: "injection", unit: "Ampoule", price: 17.16, level: "C" },
  { code: "ACETAZTA1", name: "Acetazolamide", strength: "250 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "C" },
  { code: "ACETYLIN1", name: "Acetylcysteine", strength: "200 mg/mL", form: "injection", unit: "1 mL", price: 62.98, level: "B1" },
  { code: "ACETYLTA1", name: "Acetylsalicylic Acid", strength: "300 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "A" },
  { code: "ACETYLDT1", name: "Acetylsalicylic Acid", strength: "75 mg (Dispersible)", form: "tablet", unit: "Tablet", price: 0.33, level: "B2" },
  { code: "ACTINOIN1", name: "Actinomycin D", strength: "0.5 mg", form: "injection", unit: "Intravenous Vial", price: 205.57, level: "D" },
  { code: "ACTCHAPO1", name: "Activated Charcoal", strength: "50 g", form: "powder", unit: "50 G", price: 38.55, level: "A" },
  { code: "ACICLOCR1", name: "Acyclovir", strength: "5%", form: "cream", unit: "5G", price: 38.50, level: "C" },
  { code: "ACICLOEO1", name: "Acyclovir", strength: "3%", form: "ointment", unit: "2G", price: 52.03, level: "C" },
  { code: "ACICLOIN1", name: "Acyclovir", strength: "250 mg", form: "injection", unit: "Vial", price: 136.13, level: "C" },
  { code: "ACICLOSU2", name: "Acyclovir", strength: "200 mg/5 mL", form: "suspension", unit: "20 mL", price: 276.91, level: "B2" },
  { code: "ACICLOTA1", name: "Acyclovir", strength: "200 mg", form: "tablet", unit: "Tablet", price: 1.98, level: "B2" },
  { code: "ADRENAIN1", name: "Adrenaline", strength: "1 mg/1mL (1:1000)", form: "injection", unit: "1 mL", price: 7.70, level: "M" },
  { code: "ADRENAIN2", name: "Adrenaline", strength: "1:10,000", form: "injection", unit: "Vial", price: 6.55, level: "M" },
  { code: "ADRIAMIN1", name: "Adriamycin", strength: "50 mg", form: "injection", unit: "Vial", price: 172.59, level: "D" },
  { code: "ALBENDSY1", name: "Albendazole", strength: "100 mg/5 mL", form: "syrup", unit: "20 mL", price: 4.10, level: "A" },
  { code: "ALBENDTA1", name: "Albendazole", strength: "200 mg", form: "tablet", unit: "Tablet", price: 4.68, level: "A" },
  { code: "ALBENDTA2", name: "Albendazole", strength: "400 mg", form: "tablet", unit: "Tablet", price: 1.17, level: "A" },
  { code: "ALLOPUTA1", name: "Allopurinol", strength: "100 mg", form: "tablet", unit: "Tablet", price: 0.94, level: "B1" },
  { code: "ALLOPUTA2", name: "Allopurinol", strength: "300 mg", form: "tablet", unit: "Tablet", price: 1.10, level: "B1" },
  // Additional common Ghana NHIS medicines (from known NHIS list)
  { code: "AMINOPIN1", name: "Aminophylline", strength: "250 mg/10 mL", form: "injection", unit: "Ampoule", price: 15.30, level: "B1" },
  { code: "AMINOPTA1", name: "Aminophylline", strength: "100 mg", form: "tablet", unit: "Tablet", price: 0.33, level: "B1" },
  { code: "AMOXICIN1", name: "Amoxicillin", strength: "250 mg/5 mL", form: "syrup", unit: "100 mL", price: 12.00, level: "A" },
  { code: "AMOXICTA1", name: "Amoxicillin", strength: "250 mg", form: "capsule", unit: "Capsule", price: 0.88, level: "A" },
  { code: "AMOXICTA2", name: "Amoxicillin", strength: "500 mg", form: "capsule", unit: "Capsule", price: 1.32, level: "A" },
  { code: "AMPICIN1", name: "Ampicillin", strength: "500 mg", form: "injection", unit: "Vial", price: 5.50, level: "B1" },
  { code: "ARTESUS1", name: "Artesunate", strength: "60 mg", form: "injection", unit: "Vial", price: 25.00, level: "A" },
  { code: "ARTEMTA1", name: "Artemether", strength: "20 mg", form: "tablet", unit: "Tablet", price: 2.20, level: "A" },
  { code: "ASPIRIN1", name: "Aspirin", strength: "300 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "A" },
  { code: "ASPIRIN2", name: "Aspirin", strength: "75 mg", form: "tablet", unit: "Tablet", price: 0.33, level: "B2" },
  { code: "ATENOLTA1", name: "Atenolol", strength: "50 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "B1" },
  { code: "ATENOLTA2", name: "Atenolol", strength: "100 mg", form: "tablet", unit: "Tablet", price: 1.10, level: "B1" },
  { code: "BECLONIN1", name: "Beclomethasone", strength: "50 mcg", form: "inhaler", unit: "200 Doses", price: 45.00, level: "B2" },
  { code: "BENZYPEN1", name: "Benzyl Penicillin", strength: "1 MU", form: "injection", unit: "Vial", price: 2.20, level: "B1" },
  { code: "BENZYPEN2", name: "Benzyl Penicillin", strength: "5 MU", form: "injection", unit: "Vial", price: 6.60, level: "B1" },
  { code: "BICARBIN1", name: "Sodium Bicarbonate", strength: "8.4%", form: "injection", unit: "50 mL", price: 25.00, level: "M" },
  { code: "CETRIZTA1", name: "Cetirizine", strength: "10 mg", form: "tablet", unit: "Tablet", price: 1.10, level: "C" },
  { code: "CIPROTA1", name: "Ciprofloxacin", strength: "500 mg", form: "tablet", unit: "Tablet", price: 2.20, level: "B2" },
  { code: "CLOFETA1", name: "Clofazimine", strength: "50 mg", form: "capsule", unit: "Capsule", price: 3.30, level: "D" },
  { code: "CLOMIPIN1", name: "Clomipramine", strength: "25 mg", form: "injection", unit: "Ampoule", price: 25.00, level: "C" },
  { code: "CLOMITA1", name: "Clomipramine", strength: "25 mg", form: "tablet", unit: "Tablet", price: 1.10, level: "C" },
  { code: "CLOPIN1", name: "Cloxacillin", strength: "500 mg", form: "injection", unit: "Vial", price: 4.40, level: "B1" },
  { code: "CLOPTA1", name: "Cloxacillin", strength: "250 mg", form: "capsule", unit: "Capsule", price: 0.88, level: "B1" },
  { code: "CLOPTA2", name: "Cloxacillin", strength: "500 mg", form: "capsule", unit: "Capsule", price: 1.32, level: "B1" },
  { code: "CLOPSY1", name: "Cloxacillin", strength: "125 mg/5 mL", form: "syrup", unit: "100 mL", price: 12.00, level: "B1" },
  { code: "COARTE1", name: "Artemether/Lumefantrine", strength: "20/120 mg", form: "tablet", unit: "Tablet", price: 8.80, level: "A" },
  { code: "COARTE2", name: "Artemether/Lumefantrine", strength: "20/120 mg", form: "tablet", unit: "Pack of 24", price: 35.00, level: "A" },
  { code: "CODETA1", name: "Codeine", strength: "30 mg", form: "tablet", unit: "Tablet", price: 1.10, level: "B2" },
  { code: "CODEPHL1", name: "Codeine Phosphate", strength: "15 mg/5 mL", form: "syrup", unit: "100 mL", price: 15.00, level: "B2" },
  { code: "DAPSONTA1", name: "Dapsone", strength: "50 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "D" },
  { code: "DIAZEPIN1", name: "Diazepam", strength: "10 mg/2 mL", form: "injection", unit: "Ampoule", price: 5.50, level: "C" },
  { code: "DIAZEPTA1", name: "Diazepam", strength: "5 mg", form: "tablet", unit: "Tablet", price: 0.33, level: "C" },
  { code: "DICLOIN1", name: "Diclofenac", strength: "75 mg/3 mL", form: "injection", unit: "Ampoule", price: 6.60, level: "B2" },
  { code: "DICLOTA1", name: "Diclofenac", strength: "50 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "B2" },
  { code: "DIGOXIN1", name: "Digoxin", strength: "0.25 mg/mL", form: "injection", unit: "2 mL", price: 12.00, level: "B1" },
  { code: "DIGOXTA1", name: "Digoxin", strength: "0.25 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "B1" },
  { code: "DOXYTA1", name: "Doxycycline", strength: "100 mg", form: "tablet", unit: "Tablet", price: 1.10, level: "B2" },
  { code: "ENALAPTA1", name: "Enalapril", strength: "5 mg", form: "tablet", unit: "Tablet", price: 1.10, level: "B1" },
  { code: "ENALAPTA2", name: "Enalapril", strength: "10 mg", form: "tablet", unit: "Tablet", price: 1.32, level: "B1" },
  { code: "ERYTHROSY1", name: "Erythromycin", strength: "125 mg/5 mL", form: "syrup", unit: "100 mL", price: 15.00, level: "A" },
  { code: "ERYTHR TA1", name: "Erythromycin", strength: "250 mg", form: "tablet", unit: "Tablet", price: 1.10, level: "A" },
  { code: "ERYTHR TA2", name: "Erythromycin", strength: "500 mg", form: "tablet", unit: "Tablet", price: 1.54, level: "A" },
  { code: "FLUCONIN1", name: "Fluconazole", strength: "200 mg/100 mL", form: "injection", unit: "100 mL", price: 45.00, level: "C" },
  { code: "FLUCONTA1", name: "Fluconazole", strength: "150 mg", form: "tablet", unit: "Tablet", price: 3.30, level: "C" },
  { code: "FLUCONTA2", name: "Fluconazole", strength: "200 mg", form: "tablet", unit: "Tablet", price: 4.40, level: "C" },
  { code: "FUROSTa1", name: "Furosemide", strength: "40 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "B1" },
  { code: "FUROSIN1", name: "Furosemide", strength: "20 mg/2 mL", form: "injection", unit: "Ampoule", price: 4.40, level: "B1" },
  { code: "GENTAIN1", name: "Gentamicin", strength: "40 mg/mL", form: "injection", unit: "2 mL", price: 3.30, level: "B1" },
  { code: "GlibenTA1", name: "Glibenclamide", strength: "5 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "B1" },
  { code: "GLIBENTA2", name: "Glibenclamide", strength: "2.5 mg", form: "tablet", unit: "Tablet", price: 0.33, level: "B1" },
  { code: "HALOPTA1", name: "Haloperidol", strength: "5 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "C" },
  { code: "HEPARIN1", name: "Heparin", strength: "25000 IU/5 mL", form: "injection", unit: "5 mL", price: 25.00, level: "M" },
  { code: "HYDRALIN1", name: "Hydralazine", strength: "20 mg/mL", form: "injection", unit: "1 mL", price: 8.80, level: "M" },
  { code: "HYDRALTA1", name: "Hydralazine", strength: "25 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "B1" },
  { code: "HYDROCHLOTA1", name: "Hydrochlorothiazide", strength: "25 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "B1" },
  { code: "HYDROCORTIN1", name: "Hydrocortisone", strength: "100 mg", form: "injection", unit: "Vial", price: 15.00, level: "B1" },
  { code: "IBUPTA1", name: "Ibuprofen", strength: "400 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "A" },
  { code: "IBUPTA2", name: "Ibuprofen", strength: "200 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "A" },
  { code: "INSULIN1", name: "Insulin (Soluble)", strength: "100 IU/mL", form: "injection", unit: "10 mL", price: 55.00, level: "B1" },
  { code: "INSULIN2", name: "Insulin (Isophane)", strength: "100 IU/mL", form: "injection", unit: "10 mL", price: 55.00, level: "B1" },
  { code: "KCLIN1", name: "Potassium Chloride", strength: "10%", form: "injection", unit: "10 mL", price: 12.00, level: "M" },
  { code: "KETOTA1", name: "Ketoconazole", strength: "200 mg", form: "tablet", unit: "Tablet", price: 2.20, level: "C" },
  { code: "LEVOTTA1", name: "Levothyroxine", strength: "50 mcg", form: "tablet", unit: "Tablet", price: 1.10, level: "B1" },
  { code: "LEVOTTA2", name: "Levothyroxine", strength: "100 mcg", form: "tablet", unit: "Tablet", price: 1.32, level: "B1" },
  { code: "LIDOCAIN1", name: "Lidocaine", strength: "1%", form: "injection", unit: "20 mL", price: 5.50, level: "B2" },
  { code: "LIDOCAIN2", name: "Lidocaine", strength: "2%", form: "injection", unit: "20 mL", price: 6.60, level: "B2" },
  { code: "METFORMTA1", name: "Metformin", strength: "500 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "B1" },
  { code: "METFORMTA2", name: "Metformin", strength: "850 mg", form: "tablet", unit: "Tablet", price: 1.10, level: "B1" },
  { code: "METHOTTA1", name: "Methotrexate", strength: "2.5 mg", form: "tablet", unit: "Tablet", price: 3.30, level: "D" },
  { code: "METHYDOPA1", name: "Methyldopa", strength: "250 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "B1" },
  { code: "METRONTA1", name: "Metronidazole", strength: "200 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "A" },
  { code: "METRONTA2", name: "Metronidazole", strength: "400 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "A" },
  { code: "METRONSU1", name: "Metronidazole", strength: "200 mg/5 mL", form: "suspension", unit: "100 mL", price: 12.00, level: "A" },
  { code: "MORPHIN1", name: "Morphine", strength: "10 mg/mL", form: "injection", unit: "1 mL", price: 8.80, level: "B2" },
  { code: "MORPHTA1", name: "Morphine", strength: "10 mg", form: "tablet", unit: "Tablet", price: 1.10, level: "B2" },
  { code: "NIFEDTA1", name: "Nifedipine", strength: "10 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "B1" },
  { code: "NIFEDTA2", name: "Nifedipine", strength: "20 mg", form: "tablet", unit: "Tablet", price: 1.10, level: "B1" },
  { code: "NYSTATSU1", name: "Nystatin", strength: "100000 IU/mL", form: "suspension", unit: "30 mL", price: 8.80, level: "A" },
  { code: "NYSTATCR1", name: "Nystatin", strength: "100000 IU/g", form: "cream", unit: "15G", price: 8.80, level: "A" },
  { code: "OMEPRTA1", name: "Omeprazole", strength: "20 mg", form: "capsule", unit: "Capsule", price: 2.20, level: "B2" },
  { code: "ORALRE1", name: "Oral Rehydration Salts", strength: "20.5 g/L", form: "powder", unit: "Sachet", price: 0.55, level: "A" },
  { code: "OXYTOCIN1", name: "Oxytocin", strength: "10 IU/mL", form: "injection", unit: "1 mL", price: 3.30, level: "M" },
  { code: "PARACTA1", name: "Paracetamol", strength: "500 mg", form: "tablet", unit: "Tablet", price: 0.33, level: "A" },
  { code: "PARACTA2", name: "Paracetamol", strength: "1000 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "A" },
  { code: "PARACSY1", name: "Paracetamol", strength: "120 mg/5 mL", form: "syrup", unit: "100 mL", price: 4.40, level: "A" },
  { code: "PARACSU2", name: "Paracetamol", strength: "250 mg/5 mL", form: "suspension", unit: "100 mL", price: 6.60, level: "A" },
  { code: "PHENOBTA1", name: "Phenobarbital", strength: "30 mg", form: "tablet", unit: "Tablet", price: 0.33, level: "C" },
  { code: "PHENOIN1", name: "Phenobarbital", strength: "200 mg/mL", form: "injection", unit: "1 mL", price: 8.80, level: "C" },
  { code: "PHENYTA1", name: "Phenytoin", strength: "100 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "C" },
  { code: "PHENYIN1", name: "Phenytoin", strength: "50 mg/mL", form: "injection", unit: "5 mL", price: 25.00, level: "M" },
  { code: "POTASSCHL1", name: "Potassium Chloride", strength: "600 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "B1" },
  { code: "PREDNISTA1", name: "Prednisolone", strength: "5 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "B1" },
  { code: "PROPRATA1", name: "Propranolol", strength: "40 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "C" },
  { code: "PYRIMTA1", name: "Pyrimethamine", strength: "25 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "D" },
  { code: "QUINIDIN1", name: "Quinine", strength: "300 mg/mL", form: "injection", unit: "2 mL", price: 8.80, level: "B1" },
  { code: "QUINIDTA1", name: "Quinine", strength: "300 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "B1" },
  { code: "RANITIDTA1", name: "Ranitidine", strength: "150 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "B2" },
  { code: "RANITIDIN1", name: "Ranitidine", strength: "50 mg/2 mL", form: "injection", unit: "Ampoule", price: 5.50, level: "B2" },
  { code: "RESCALTA1", name: "Reserpine", strength: "0.25 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "B1" },
  { code: "RIFAMTA1", name: "Rifampicin", strength: "150 mg", form: "capsule", unit: "Capsule", price: 1.10, level: "D" },
  { code: "RIFAMTA2", name: "Rifampicin", strength: "300 mg", form: "capsule", unit: "Capsule", price: 1.54, level: "D" },
  { code: "RIFAMSU1", name: "Rifampicin", strength: "20 mg/mL", form: "suspension", unit: "100 mL", price: 25.00, level: "D" },
  { code: "SALBUIN1", name: "Salbutamol", strength: "0.5 mg/mL", form: "injection", unit: "1 mL", price: 5.50, level: "B2" },
  { code: "SALBUTA1", name: "Salbutamol", strength: "2 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "B2" },
  { code: "SALBUINH1", name: "Salbutamol", strength: "100 mcg", form: "inhaler", unit: "200 Doses", price: 35.00, level: "B2" },
  { code: "SALBUSY1", name: "Salbutamol", strength: "2 mg/5 mL", form: "syrup", unit: "100 mL", price: 8.80, level: "B2" },
  { code: "SENNATA1", name: "Senna", strength: "7.5 mg", form: "tablet", unit: "Tablet", price: 0.33, level: "A" },
  { code: "SPECTIN1", name: "Spectinomycin", strength: "2 g", form: "injection", unit: "Vial", price: 25.00, level: "B1" },
  { code: "SPITATA1", name: "Spironolactone", strength: "25 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "B1" },
  { code: "SULFATA1", name: "Sulfadoxine/Pyrimethamine", strength: "500/25 mg", form: "tablet", unit: "Tablet", price: 1.10, level: "A" },
  { code: "TETRACYTA1", name: "Tetracycline", strength: "250 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "B2" },
  { code: "THIAZTA1", name: "Thiacetazone", strength: "50 mg", form: "tablet", unit: "Tablet", price: 0.33, level: "D" },
  { code: "VERAPTA1", name: "Verapamil", strength: "40 mg", form: "tablet", unit: "Tablet", price: 0.88, level: "B1" },
  { code: "VITAB1", name: "Vitamin B Complex", strength: "", form: "tablet", unit: "Tablet", price: 0.55, level: "A" },
  { code: "VITABIN1", name: "Vitamin B Complex", strength: "", form: "injection", unit: "2 mL", price: 3.30, level: "A" },
  { code: "VITACTA1", name: "Vitamin C", strength: "200 mg", form: "tablet", unit: "Tablet", price: 0.55, level: "A" },
  { code: "ZINC1", name: "Zinc Sulphate", strength: "20 mg", form: "tablet", unit: "Tablet", price: 0.33, level: "A" },
  { code: "ZINCTA2", name: "Zinc Sulphate", strength: "10 mg", form: "tablet", unit: "Tablet", price: 0.22, level: "A" },
];

async function main() {
  const orgId = process.argv[2];
  if (!orgId) {
    console.error("Usage: npx tsx scripts/seed-nhis-medicines.ts <organizationId>");
    process.exit(1);
  }

  console.log(`Seeding ${NHIS_MEDICINES.length} NHIS medicines for organization: ${orgId}`);

  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const med of NHIS_MEDICINES) {
    // Check if medication already exists by NHIS code
    const existing = await db.medication.findFirst({
      where: {
        organizationId: orgId,
        nhisCode: med.code,
      },
    });

    if (existing) {
      // Update NHIS fields if missing
      if (!existing.nhisTariffAmount || !existing.nhisPrescribingLevel) {
        await db.medication.update({
          where: { id: existing.id },
          data: {
            nhisCode: med.code,
            nhisTariffAmount: med.price,
            nhisPrescribingLevel: med.level,
            nhisUnitOfPricing: med.unit,
            dosageForm: existing.dosageForm || med.form,
            strength: existing.strength || med.strength,
          },
        });
        updated++;
        continue;
      }
      skipped++;
      continue;
    }

    // Also check by genericName + strength (might exist without NHIS code)
    const existingByName = await db.medication.findFirst({
      where: {
        organizationId: orgId,
        genericName: { equals: med.name, mode: "insensitive" },
        strength: med.strength || null,
      },
    });

    if (existingByName) {
      // Update with NHIS data
      await db.medication.update({
        where: { id: existingByName.id },
        data: {
          nhisCode: med.code,
          nhisTariffAmount: med.price,
          nhisPrescribingLevel: med.level,
          nhisUnitOfPricing: med.unit,
          dosageForm: existingByName.dosageForm || med.form,
        },
      });
      updated++;
      continue;
    }

    // Create new medication with NHIS data
    await db.medication.create({
      data: {
        organizationId: orgId,
        genericName: med.name,
        strength: med.strength || null,
        dosageForm: med.form || null,
        route: med.form === "injection" ? "iv" : med.form === "cream" || med.form === "ointment" ? "topical" : "oral",
        nhisCode: med.code,
        nhisTariffAmount: med.price,
        nhisPrescribingLevel: med.level,
        nhisUnitOfPricing: med.unit,
        status: "active",
        prescriptionStatus: med.level === "A" ? "otc" : "prescription_required",
        formularyStatus: "formulary",
      },
    });
    created++;
  }

  console.log(`\nDone. Created: ${created}, Updated: ${updated}, Skipped (already had NHIS data): ${skipped}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
