// =====================================================================
// SEED PHASE 2 — Continue from where seed.ts left off
// Idempotent — only creates what's missing
// =====================================================================
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed Phase 2 — continuing from where seed.ts stopped...");

  const org = await prisma.organization.findFirst({ where: { code: "JEM" } });
  if (!org) throw new Error("Organization not found — run seed.ts first");
  const facilities = await prisma.facility.findMany({ where: { organizationId: org.id } });
  console.log(`✓ Found org: ${org.name} with ${facilities.length} facilities`);

  // ─── Complete services catalog ─────────────────────────────
  const servicesData = [
    { name: "OPD Consultation", code: "OPD-CONS", category: "consultation", defaultPrice: 50 },
    { name: "Specialist Consultation", code: "SPEC-CONS", category: "consultation", defaultPrice: 100 },
    { name: "Emergency Consultation", code: "EMERG-CONS", category: "consultation", defaultPrice: 80 },
    { name: "Follow-up Consultation", code: "FUP-CONS", category: "consultation", defaultPrice: 30 },
    { name: "Bed Charge (per day, general)", code: "BED-GEN", category: "admission", defaultPrice: 80 },
    { name: "Bed Charge (per day, ICU)", code: "BED-ICU", category: "admission", defaultPrice: 300 },
    { name: "Nursing Care (per day)", code: "NURSE-DAY", category: "nursing", defaultPrice: 50 },
    { name: "Minor Procedure", code: "PROC-MIN", category: "procedure", defaultPrice: 150 },
    { name: "Major Procedure", code: "PROC-MAJ", category: "procedure", defaultPrice: 800 },
    { name: "Wound Dressing", code: "WOUND", category: "procedure", defaultPrice: 40 },
    { name: "Suture Removal", code: "SUTURE", category: "procedure", defaultPrice: 30 },
    { name: "IV Cannulation", code: "IVC", category: "procedure", defaultPrice: 25 },
    { name: "X-Ray Chest", code: "XR-CHST", category: "imaging", defaultPrice: 80 },
    { name: "Ultrasound Abdomen", code: "US-ABD", category: "imaging", defaultPrice: 150 },
    { name: "CT Scan", code: "CT", category: "imaging", defaultPrice: 500 },
    { name: "MRI", code: "MRI", category: "imaging", defaultPrice: 800 },
    { name: "Pharmacy Dispensing Fee", code: "DISP-FEE", category: "pharmacy", defaultPrice: 5 },
    { name: "Registration Fee", code: "REG-FEE", category: "other", defaultPrice: 10 },
  ];

  let servicesCreated = 0;
  for (const s of servicesData) {
    const existing = await prisma.service.findUnique({
      where: { organizationId_code: { organizationId: org.id, code: s.code } },
    });
    if (existing) continue;
    await prisma.service.create({
      data: { ...s, organizationId: org.id, status: "active" },
    });
    servicesCreated++;
  }
  console.log(`✓ Services: ${servicesCreated} new (${servicesData.length} total in catalog)`);

  // ─── Create facility_service_prices for ALL services × facilities ───
  const allServices = await prisma.service.findMany({ where: { organizationId: org.id } });
  let pricesCreated = 0;
  for (const service of allServices) {
    for (const f of facilities) {
      const existing = await prisma.facilityServicePrice.findUnique({
        where: { facilityId_serviceId: { facilityId: f.id, serviceId: service.id } },
      });
      if (existing) continue;
      await prisma.facilityServicePrice.create({
        data: {
          facilityId: f.id,
          serviceId: service.id,
          price: service.defaultPrice,
          status: "active",
        },
      });
      pricesCreated++;
    }
  }
  console.log(`✓ Facility service prices: ${pricesCreated} new`);

  // ─── Suppliers ───────────────────────────────────────────────
  const suppliersData = [
    { name: "Ernest Chemist Limited", code: "ERN-CHM", contactPerson: "Ernest Osei", phone: "+233 30 222 4444", email: "sales@ernestchemist.com", address: "Accra, Ghana" },
    { name: "M&G Pharmaceuticals", code: "MG-PHARMA", contactPerson: "George Mensah", phone: "+233 30 333 5555", email: "info@mgpharma.com", address: "Tema, Ghana" },
    { name: "Kinapharma Limited", code: "KINA", contactPerson: "Kina Acheampong", phone: "+233 30 444 6666", email: "info@kinapharma.com", address: "Accra, Ghana" },
    { name: "Medlab Supplies Ltd", code: "MEDLAB-SUP", contactPerson: "Linda Owusu", phone: "+233 30 555 7777", email: "info@medlabsupplies.com", address: "Kumasi, Ghana" },
  ];
  let suppliersCreated = 0;
  for (const s of suppliersData) {
    const existing = await prisma.supplier.findUnique({
      where: { organizationId_code: { organizationId: org.id, code: s.code } },
    });
    if (existing) continue;
    await prisma.supplier.create({ data: { ...s, organizationId: org.id, status: "active" } });
    suppliersCreated++;
  }
  console.log(`✓ Suppliers: ${suppliersCreated} new`);

  // ─── Medications ────────────────────────────────────────────
  const medsData = [
    { genericName: "Paracetamol", brandName: "Panadol", strength: "500mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Amoxicillin", brandName: "Amoxil", strength: "500mg", dosageForm: "capsule", route: "oral", unit: "capsule" },
    { genericName: "Ibuprofen", brandName: "Brufen", strength: "400mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Metformin", brandName: "Glucophage", strength: "500mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Omeprazole", brandName: "Prilosec", strength: "20mg", dosageForm: "capsule", route: "oral", unit: "capsule" },
    { genericName: "Cetirizine", brandName: "Zyrtec", strength: "10mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Artemether/Lumefantrine", brandName: "Coartem", strength: "20/120mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Ciprofloxacin", brandName: "Cipro", strength: "500mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Diclofenac", brandName: "Voltaren", strength: "50mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Salbutamol Inhaler", brandName: "Ventolin", strength: "100mcg", dosageForm: "inhaler", route: "inhaled", unit: "puff" },
    { genericName: "Aspirin", brandName: "Bayer", strength: "75mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Atenolol", brandName: "Tenormin", strength: "50mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Amlodipine", brandName: "Norvasc", strength: "5mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Metronidazole", brandName: "Flagyl", strength: "400mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "ORS (Oral Rehydration Salts)", brandName: "ORS", strength: "20.5g/L", dosageForm: "sachet", route: "oral", unit: "sachet" },
    { genericName: "Magnesium Trisilicate", brandName: "Gestid", strength: "500mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Vitamin C", brandName: "Redoxon", strength: "500mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Folic Acid", brandName: "Folic Acid", strength: "5mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Ferrous Sulphate", brandName: "Feosol", strength: "200mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
    { genericName: "Chlorpheniramine", brandName: "Piriton", strength: "4mg", dosageForm: "tablet", route: "oral", unit: "tablet" },
  ];
  let medsCreated = 0;
  for (const m of medsData) {
    const existing = await prisma.medication.findFirst({
      where: { genericName: m.genericName, brandName: m.brandName },
    });
    if (existing) continue;
    await prisma.medication.create({ data: { ...m, organizationId: org.id, status: "active" } });
    medsCreated++;
  }
  console.log(`✓ Medications: ${medsCreated} new`);

  // ─── Inventory items + facility_inventory + batches + transactions ───
  // For each medication, create an InventoryItem + FacilityInventory (per facility) + 1 batch + 1 opening transaction
  const meds = await prisma.medication.findMany({ where: { organizationId: org.id } });
  let invItemsCreated = 0;
  let facilityInvCreated = 0;
  let batchesCreated = 0;
  let txnsCreated = 0;
  for (const med of meds) {
    let item = await prisma.inventoryItem.findFirst({ where: { medicationId: med.id } });
    if (!item) {
      item = await prisma.inventoryItem.create({
        data: {
          organizationId: org.id,
          name: `${med.genericName} ${med.strength || ""}`.trim(),
          sku: `MED-${med.id.slice(-6).toUpperCase()}`,
          itemType: "medication",
          category: "pharmacy",
          unit: med.unit,
          description: `${med.genericName} (${med.brandName})`,
          reorderLevel: 50,
          status: "active",
          medicationId: med.id,
        },
      });
      invItemsCreated++;
    }

    for (const f of facilities) {
      let fi = await prisma.facilityInventory.findUnique({
        where: { facilityId_inventoryItemId: { facilityId: f.id, inventoryItemId: item.id } },
      });
      if (!fi) {
        fi = await prisma.facilityInventory.create({
          data: {
            facilityId: f.id,
            inventoryItemId: item.id,
            currentQuantity: 200,
            minimumQuantity: 50,
            maximumQuantity: 1000,
            storageLocation: "Pharmacy Store",
          },
        });
        facilityInvCreated++;
      }

      const batchNumber = `B-${med.id.slice(-4).toUpperCase()}-${f.code.slice(-3)}`;
      const existingBatch = await prisma.inventoryBatch.findFirst({
        where: { facilityInventoryId: fi.id, batchNumber },
      });
      if (!existingBatch) {
        await prisma.inventoryBatch.create({
          data: {
            facilityInventoryId: fi.id,
            batchNumber,
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            quantity: 200,
            costPrice: 0.5,
            sellingPrice: 1.0,
            receivedAt: new Date(),
            status: "active",
          },
        });
        batchesCreated++;
      }

      // Opening inventory transaction
      const existingTxn = await prisma.inventoryTransaction.findFirst({
        where: { inventoryItemId: item.id, facilityId: f.id, referenceType: "initial_stock" },
      });
      if (!existingTxn) {
        await prisma.inventoryTransaction.create({
          data: {
            facilityId: f.id,
            inventoryItemId: item.id,
            transactionType: "receive",
            quantity: 200,
            referenceType: "initial_stock",
            notes: "Opening stock (seed)",
            transactionAt: new Date(),
          },
        });
        txnsCreated++;
      }
    }
  }
  console.log(`✓ Medication inventory: ${invItemsCreated} items + ${facilityInvCreated} facility_inventories + ${batchesCreated} batches + ${txnsCreated} transactions`);

  // ─── Consumables inventory ──────────────────────────────────
  const consumablesData = [
    { name: "Examination Gloves (box of 100)", sku: "CONS-GLOVE", unit: "box", reorderLevel: 20 },
    { name: "Surgical Gloves (size M, box of 50)", sku: "CONS-SGLOVE-M", unit: "box", reorderLevel: 20 },
    { name: "Syringes 5ml (box of 100)", sku: "CONS-SYR-5", unit: "box", reorderLevel: 10 },
    { name: "Needles 21G (box of 100)", sku: "CONS-NEED-21", unit: "box", reorderLevel: 10 },
    { name: "Cotton Wool 500g", sku: "CONS-COTTON", unit: "roll", reorderLevel: 10 },
    { name: "Bandages 4-inch", sku: "CONS-BAND-4", unit: "roll", reorderLevel: 15 },
    { name: "Alcohol Swabs (box of 100)", sku: "CONS-ALCOHOL", unit: "box", reorderLevel: 20 },
    { name: "IV Giving Set", sku: "CONS-IVSET", unit: "piece", reorderLevel: 30 },
    { name: "Urinary Catheter (Foley 16Fr)", sku: "CONS-CATH-16", unit: "piece", reorderLevel: 5 },
    { name: "Suture Pack (Vicryl 2-0)", sku: "CONS-SUT-V2", unit: "pack", reorderLevel: 10 },
  ];
  let consItemsCreated = 0;
  let consFacInvCreated = 0;
  let consBatchesCreated = 0;
  let consTxnsCreated = 0;
  for (const c of consumablesData) {
    let item = await prisma.inventoryItem.findUnique({
      where: { organizationId_sku: { organizationId: org.id, sku: c.sku } },
    });
    if (!item) {
      item = await prisma.inventoryItem.create({
        data: {
          organizationId: org.id,
          name: c.name,
          sku: c.sku,
          itemType: "consumable",
          category: "general",
          unit: c.unit,
          reorderLevel: c.reorderLevel,
          status: "active",
        },
      });
      consItemsCreated++;
    }

    for (const f of facilities) {
      let fi = await prisma.facilityInventory.findUnique({
        where: { facilityId_inventoryItemId: { facilityId: f.id, inventoryItemId: item.id } },
      });
      if (!fi) {
        fi = await prisma.facilityInventory.create({
          data: {
            facilityId: f.id,
            inventoryItemId: item.id,
            currentQuantity: 100,
            minimumQuantity: c.reorderLevel,
            maximumQuantity: 500,
            storageLocation: "Main Store",
          },
        });
        consFacInvCreated++;
      }

      const batchNumber = `B-CONS-${c.sku.slice(-3)}-${f.code.slice(-3)}`;
      const existingBatch = await prisma.inventoryBatch.findFirst({
        where: { facilityInventoryId: fi.id, batchNumber },
      });
      if (!existingBatch) {
        await prisma.inventoryBatch.create({
          data: {
            facilityInventoryId: fi.id,
            batchNumber,
            expiryDate: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000),
            quantity: 100,
            costPrice: 10,
            sellingPrice: 20,
            receivedAt: new Date(),
            status: "active",
          },
        });
        consBatchesCreated++;
      }

      const existingTxn = await prisma.inventoryTransaction.findFirst({
        where: { inventoryItemId: item.id, facilityId: f.id, referenceType: "initial_stock" },
      });
      if (!existingTxn) {
        await prisma.inventoryTransaction.create({
          data: {
            facilityId: f.id,
            inventoryItemId: item.id,
            transactionType: "receive",
            quantity: 100,
            referenceType: "initial_stock",
            notes: "Opening stock (seed)",
            transactionAt: new Date(),
          },
        });
        consTxnsCreated++;
      }
    }
  }
  console.log(`✓ Consumables inventory: ${consItemsCreated} items + ${consFacInvCreated} facility_inventories + ${consBatchesCreated} batches + ${consTxnsCreated} transactions`);

  // ─── Sample patients ─────────────────────────────────────────
  const samplePatients = [
    { firstName: "Kwame", lastName: "Asante", sex: "male", dateOfBirth: new Date("1985-06-15"), phone: "+233244111222", bloodGroup: "O+", address: "Spintex, Accra" },
    { firstName: "Abena", lastName: "Fosu", sex: "female", dateOfBirth: new Date("1990-09-22"), phone: "+233244333444", bloodGroup: "A+", address: "Madina, Accra" },
    { firstName: "Yaw", lastName: "Prempeh", sex: "male", dateOfBirth: new Date("1978-03-10"), phone: "+233244555666", bloodGroup: "B+", address: "Tema Community 1" },
  ];
  let patientsCreated = 0;
  const nhis = await prisma.insuranceProvider.findFirst({ where: { organizationId: org.id, code: "NHIS" } });
  for (let i = 0; i < samplePatients.length; i++) {
    const sp = samplePatients[i];
    const patientNumber = `JEM-${String(i + 1).padStart(7, "0")}`;
    const existing = await prisma.patient.findUnique({
      where: { organizationId_patientNumber: { organizationId: org.id, patientNumber } },
    });
    if (existing) continue;

    const patient = await prisma.patient.create({
      data: {
        ...sp,
        organizationId: org.id,
        patientNumber,
        nationality: "Ghanaian",
        country: "Ghana",
        city: "Accra",
        region: "Greater Accra",
        status: "active",
        registeredAtFacilityId: facilities[0].id,
        registrationDate: new Date(),
      },
    });
    patientsCreated++;

    // Ghana Card identifier
    await prisma.patientIdentifier.create({
      data: {
        patientId: patient.id,
        identifierType: "ghana_card",
        identifierValue: `GHA-${100000000 + i}`,
        isPrimary: true,
        verified: true,
        verifiedAt: new Date(),
      },
    });

    // Emergency contact
    await prisma.patientContact.create({
      data: {
        patientId: patient.id,
        name: i === 0 ? "Adwoa Asante" : i === 1 ? "Kofi Fosu" : "Ama Prempeh",
        relationship: "spouse",
        phone: "+233244999000",
        isPrimary: true,
      },
    });

    // NHIS insurance
    if (nhis) {
      await prisma.patientInsurance.create({
        data: {
          patientId: patient.id,
          insuranceProviderId: nhis.id,
          membershipNumber: `NHIS-${2000000 + i}`,
          policyNumber: `POL-${3000000 + i}`,
          principalMember: `${sp.firstName} ${sp.lastName}`,
          relationshipToPrincipal: "self",
          coverageStart: new Date(),
          coverageEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          verificationStatus: "verified",
          verifiedAt: new Date(),
          status: "active",
        },
      });
    }

    // Sample allergies & medical history for first patient
    if (i === 0) {
      await prisma.allergy.create({
        data: {
          patientId: patient.id,
          allergen: "Penicillin",
          reaction: "Skin rash",
          severity: "moderate",
          status: "active",
          verified: true,
        },
      });
      await prisma.medicalHistory.create({
        data: {
          patientId: patient.id,
          condition: "Hypertension",
          description: "Diagnosed 2020, on antihypertensives",
          status: "chronic",
          diagnosedDate: new Date("2020-01-01"),
        },
      });
    }
  }
  console.log(`✓ Sample patients: ${patientsCreated} new`);

  console.log("\n✅ Seed Phase 2 complete!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
