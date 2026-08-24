// =====================================================================
// SEED: Common Drug-Drug Interactions
// =====================================================================
// Seeds the MedicationInteraction table with common clinically significant
// drug-drug interactions based on therapeutic class matching.
//
// Usage: npx tsx scripts/seed-interactions.ts <organizationId>
// =====================================================================
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
config({ path: ".env", override: true });

const db = new PrismaClient();

async function main() {
  const orgId = process.argv[2] || process.env.ORGANIZATION_ID;
  if (!orgId) {
    console.error("Usage: npx tsx scripts/seed-interactions.ts <organizationId>");
    process.exit(1);
  }

  console.log(`Seeding drug-drug interactions for organization: ${orgId}`);

  const INTERACTIONS = [
    {
      therapeuticClassA: "NSAID",
      therapeuticClassB: "Anticoagulant",
      severity: "severe",
      description: "NSAIDs enhance the anticoagulant effect of warfarin, increasing bleeding risk.",
      clinicalAdvice: "Monitor INR closely. Consider paracetamol instead of NSAIDs. If NSAID is necessary, use with PPI cover.",
    },
    {
      therapeuticClassA: "NSAID",
      therapeuticClassB: "ACE inhibitor",
      severity: "moderate",
      description: "NSAIDs may reduce the antihypertensive effect of ACE inhibitors and increase renal impairment risk.",
      clinicalAdvice: "Monitor blood pressure and renal function. Consider alternative analgesic.",
    },
    {
      therapeuticClassA: "NSAID",
      therapeuticClassB: "Diuretic",
      severity: "moderate",
      description: "NSAIDs may reduce the diuretic effect and increase risk of renal impairment.",
      clinicalAdvice: "Monitor renal function and fluid status.",
    },
    {
      therapeuticClassA: "ACE inhibitor",
      therapeuticClassB: "Potassium-sparing diuretic",
      severity: "severe",
      description: "Risk of life-threatening hyperkalemia when ACE inhibitors are combined with potassium-sparing diuretics.",
      clinicalAdvice: "Monitor serum potassium closely. Avoid combination if possible.",
    },
    {
      therapeuticClassA: "Penicillin",
      therapeuticClassB: "Macrolide",
      severity: "mild",
      description: "Macrolides may antagonize the bactericidal effect of penicillins (inhibiting cell wall synthesis while the other needs active growth).",
      clinicalAdvice: "Generally acceptable in clinical practice, but consider if both are truly necessary.",
    },
    {
      therapeuticClassA: "Warfarin",
      therapeuticClassB: "Fluoroquinolone",
      severity: "severe",
      description: "Fluoroquinolones can potentiate warfarin effect, increasing INR and bleeding risk.",
      clinicalAdvice: "Monitor INR within 3 days of starting. Adjust warfarin dose as needed.",
    },
    {
      therapeuticClassA: "Warfarin",
      therapeuticClassB: "Macrolide",
      severity: "severe",
      description: "Macrolides (especially erythromycin, clarithromycin) inhibit warfarin metabolism, increasing INR and bleeding risk.",
      clinicalAdvice: "Monitor INR closely. Consider azithromycin (less interaction) or alternative antibiotic.",
    },
    {
      therapeuticClassA: "Warfarin",
      therapeuticClassB: "Metronidazole",
      severity: "severe",
      description: "Metronidazole inhibits warfarin metabolism via CYP2C9, significantly increasing INR and bleeding risk.",
      clinicalAdvice: "Reduce warfarin dose by 25-50% if co-administration is necessary. Monitor INR every 2-3 days.",
    },
    {
      therapeuticClassA: "SSRI",
      therapeuticClassB: "MAOI",
      severity: "contraindicated",
      description: "Risk of serotonin syndrome — potentially life-threatening.",
      clinicalAdvice: "CONTRAINDICATED. Allow 2-week washout (5 weeks for fluoxetine) between MAOI and SSRI.",
    },
    {
      therapeuticClassA: "SSRI",
      therapeuticClassB: "Tramadol",
      severity: "severe",
      description: "Risk of serotonin syndrome when SSRIs are combined with tramadol.",
      clinicalAdvice: "Use with caution. Consider alternative analgesic. Monitor for signs of serotonin syndrome.",
    },
    {
      therapeuticClassA: "Sulfonylurea",
      therapeuticClassB: "Fluoroquinolone",
      severity: "moderate",
      description: "Fluoroquinolones may potentiate the hypoglycemic effect of sulfonylureas.",
      clinicalAdvice: "Monitor blood glucose closely. Adjust sulfonylurea dose if needed.",
    },
    {
      therapeuticClassA: "Digoxin",
      therapeuticClassB: "Diuretic",
      severity: "moderate",
      description: "Diuretic-induced hypokalemia/hypomagnesemia can potentiate digoxin toxicity.",
      clinicalAdvice: "Monitor serum potassium and magnesium. Supplement if needed.",
    },
    {
      therapeuticClassA: "Statins",
      therapeuticClassB: "Macrolide",
      severity: "severe",
      description: "Macrolides (especially erythromycin, clarithromycin) inhibit statin metabolism, increasing risk of rhabdomyolysis.",
      clinicalAdvice: "Consider holding statin during macrolide therapy, or use azithromycin.",
    },
    {
      therapeuticClassA: "Methotrexate",
      therapeuticClassB: "NSAID",
      severity: "severe",
      description: "NSAIDs reduce methotrexate clearance, increasing risk of methotrexate toxicity (bone marrow suppression, hepatotoxicity).",
      clinicalAdvice: "Use with extreme caution. Monitor CBC and LFTs. Consider paracetamol instead.",
    },
    {
      therapeuticClassA: "Lithium",
      therapeuticClassB: "NSAID",
      severity: "severe",
      description: "NSAIDs reduce lithium renal clearance, increasing risk of lithium toxicity.",
      clinicalAdvice: "Monitor serum lithium levels. Consider paracetamol instead of NSAIDs.",
    },
    {
      therapeuticClassA: "Lithium",
      therapeuticClassB: "Diuretic",
      severity: "severe",
      description: "Thiazide diuretics reduce lithium renal clearance, increasing risk of lithium toxicity.",
      clinicalAdvice: "Monitor serum lithium levels closely. Reduce lithium dose by 25-50% if starting a thiazide.",
    },
    {
      therapeuticClassA: "Anticoagulant",
      therapeuticClassB: "Antiplatelet",
      severity: "severe",
      description: "Combined anticoagulant and antiplatelet therapy significantly increases bleeding risk.",
      clinicalAdvice: "Use only when clearly indicated (e.g., mechanical valve + ACS). Monitor for bleeding signs.",
    },
    {
      therapeuticClassA: "Opioid",
      therapeuticClassB: "Benzodiazepine",
      severity: "severe",
      description: "Combined CNS depression — risk of respiratory depression and fatal overdose.",
      clinicalAdvice: "Use with extreme caution. Reduce doses. Monitor respiratory status. Consider naloxone availability.",
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const ix of INTERACTIONS) {
    // Check if this interaction already exists
    const existing = await db.medicationInteraction.findFirst({
      where: {
        organizationId: orgId,
        therapeuticClassA: ix.therapeuticClassA,
        therapeuticClassB: ix.therapeuticClassB,
      },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await db.medicationInteraction.create({
      data: {
        organizationId: orgId,
        therapeuticClassA: ix.therapeuticClassA,
        therapeuticClassB: ix.therapeuticClassB,
        severity: ix.severity,
        description: ix.description,
        clinicalAdvice: ix.clinicalAdvice,
        isActive: true,
      },
    });
    created++;
    console.log(`  ✅ ${ix.severity.toUpperCase()}: ${ix.therapeuticClassA} + ${ix.therapeuticClassB}`);
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
