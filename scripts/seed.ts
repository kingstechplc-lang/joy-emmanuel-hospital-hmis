// =====================================================================
// SEED SCRIPT — Joy Emmanuel Hospital HMIS
// =====================================================================
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Joy Emmanuel Hospital HMIS...");

  const org = await prisma.organization.upsert({
    where: { code: "JEM" },
    update: {},
    create: {
      name: "Joy Emmanuel Hospital",
      code: "JEM",
      description: "Joy Emmanuel Hospital — Multi-facility Healthcare Network",
      phone: "+233 30 000 0000",
      email: "info@joyemmanuelhospital.org",
      address: "Accra, Ghana",
      website: "https://joyemmanuelhospital.org",
      status: "active",
      settings: JSON.stringify({ currency: "GHS", timezone: "Africa/Accra" }),
    },
  });
  console.log(`✓ Organization: ${org.name}`);

  const facilitiesData = [
    { name: "Joy Emmanuel Hospital — Accra", code: "JEM-ACCRA", facilityType: "hospital", address: "Independence Ave, Accra", city: "Accra", region: "Greater Accra", country: "Ghana", phone: "+233 30 111 1111", email: "accra@joyemmanuelhospital.org" },
    { name: "Joy Emmanuel Hospital — Kasoa", code: "JEM-KASOA", facilityType: "hospital", address: "Kasoa-Winneba Rd, Kasoa", city: "Kasoa", region: "Central", country: "Ghana", phone: "+233 30 222 2222", email: "kasoa@joyemmanuelhospital.org" },
    { name: "Joy Emmanuel Hospital — Tema", code: "JEM-TEMA", facilityType: "hospital", address: "Harbour Rd, Tema", city: "Tema", region: "Greater Accra", country: "Ghana", phone: "+233 30 333 3333", email: "tema@joyemmanuelhospital.org" },
  ];

  const facilities: any[] = [];
  for (const fd of facilitiesData) {
    const f = await prisma.facility.upsert({
      where: { organizationId_code: { organizationId: org.id, code: fd.code } },
      update: {},
      create: { ...fd, organizationId: org.id, status: "active", timezone: "Africa/Accra" },
    });
    facilities.push(f);
    console.log(`✓ Facility: ${f.name}`);
  }

  const departmentsData = [
    { code: "OPD", name: "Outpatient Department" },
    { code: "EMERG", name: "Emergency" },
    { code: "LAB", name: "Laboratory" },
    { code: "PHARM", name: "Pharmacy" },
    { code: "RAD", name: "Radiology / Imaging" },
    { code: "NURS", name: "Nursing" },
    { code: "RECORDS", name: "Medical Records" },
    { code: "FIN", name: "Finance" },
    { code: "ADMIN", name: "Administration" },
    { code: "PROC", name: "Procurement" },
    { code: "STORES", name: "Stores" },
    { code: "MAT", name: "Maternity" },
    { code: "THEATRE", name: "Theatre" },
    { code: "PAED", name: "Paediatrics" },
    { code: "MED", name: "Internal Medicine" },
    { code: "SURG", name: "Surgery" },
  ];

  for (const facility of facilities) {
    for (const dd of departmentsData) {
      await prisma.department.upsert({
        where: { facilityId_code: { facilityId: facility.id, code: dd.code } },
        update: {},
        create: { ...dd, facilityId: facility.id, status: "active" },
      });
    }
  }
  console.log(`✓ Departments: ${departmentsData.length} per facility`);

  const wardsData = [
    { code: "W-GEN-M", name: "General Ward — Male", wardType: "general", genderPolicy: "male", capacity: 20 },
    { code: "W-GEN-F", name: "General Ward — Female", wardType: "general", genderPolicy: "female", capacity: 20 },
    { code: "W-MAT", name: "Maternity Ward", wardType: "maternity", genderPolicy: "female", capacity: 12 },
    { code: "W-PAED", name: "Paediatric Ward", wardType: "paediatric", genderPolicy: "mixed", capacity: 10 },
    { code: "W-ICU", name: "Intensive Care Unit", wardType: "icu", genderPolicy: "mixed", capacity: 6 },
    { code: "W-SURG", name: "Surgical Ward", wardType: "surgical", genderPolicy: "mixed", capacity: 8 },
  ];

  for (const facility of facilities) {
    for (const wd of wardsData) {
      const existingWard = await prisma.ward.findFirst({ where: { facilityId: facility.id, code: wd.code } });
      if (existingWard) continue;
      const ward = await prisma.ward.create({ data: { ...wd, facilityId: facility.id, status: "active" } });
      const room = await prisma.room.create({
        data: { wardId: ward.id, roomNumber: `${ward.code}-R1`, roomType: ward.wardType === "icu" ? "private" : "ward", capacity: ward.capacity, status: "active" },
      });
      for (let i = 1; i <= Math.min(ward.capacity, 6); i++) {
        const existingBed = await prisma.bed.findFirst({ where: { wardId: ward.id, bedNumber: `${ward.code}-${String(i).padStart(2, "0")}` } });
        if (existingBed) continue;
        await prisma.bed.create({
          data: {
            facilityId: facility.id,
            wardId: ward.id,
            roomId: room.id,
            bedNumber: `${ward.code}-${String(i).padStart(2, "0")}`,
            bedType: ward.wardType === "icu" ? "icu" : ward.wardType === "maternity" ? "maternity" : "regular",
            status: "available",
          },
        });
      }
    }
  }
  console.log(`✓ Wards, rooms, beds: ${wardsData.length} wards × ${facilities.length} facilities`);

  const allPerms = Object.values(PERMISSIONS);
  const permByCode: Record<string, any> = {};
  for (const code of allPerms) {
    const p = await prisma.permission.upsert({
      where: { code: code as string },
      update: {},
      create: {
        code: code as string,
        name: (code as string).replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        module: (code as string).split(".")[0],
      },
    });
    permByCode[code as string] = p;
  }
  console.log(`✓ Permissions: ${allPerms.length}`);

  const rolesData = Object.entries(ROLE_PERMISSIONS);
  const rolesByCode: Record<string, any> = {};
  for (const [code, perms] of rolesData) {
    const role = await prisma.role.upsert({
      where: { organizationId_code: { organizationId: org.id, code } },
      update: {},
      create: {
        organizationId: org.id,
        code,
        name: code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        description: `System role: ${code}`,
        isSystemRole: true,
      },
    });
    rolesByCode[code] = role;
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permCode of perms) {
      const perm = permByCode[permCode as string];
      if (perm) {
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
      }
    }
  }
  console.log(`✓ Roles: ${rolesData.length}`);

  const passwordHash = await bcrypt.hash("Password@2026", 10);

  const usersData = [
    { username: "superadmin", firstName: "Super", lastName: "Admin", email: "superadmin@jem.org", role: "super_admin", profRole: null, deptCode: "ADMIN" },
    { username: "orgadmin", firstName: "Org", lastName: "Admin", email: "orgadmin@jem.org", role: "organization_admin", profRole: null, deptCode: "ADMIN" },
    { username: "facadmin", firstName: "Facility", lastName: "Admin", email: "facadmin@jem.org", role: "facility_admin", profRole: "Facility Manager", deptCode: "ADMIN" },
    { username: "doctor", firstName: "John", lastName: "Mensah", email: "doctor@jem.org", role: "doctor", profRole: "Medical Officer", deptCode: "MED" },
    { username: "nurse", firstName: "Mary", lastName: "Asante", email: "nurse@jem.org", role: "nurse", profRole: "Registered Nurse", deptCode: "NURS" },
    { username: "pharmacist", firstName: "Kwabena", lastName: "Boateng", email: "pharmacist@jem.org", role: "pharmacist", profRole: "Pharmacist", deptCode: "PHARM" },
    { username: "labscientist", firstName: "Ama", lastName: "Owusu", email: "lab@jem.org", role: "laboratory_scientist", profRole: "Medical Laboratory Scientist", deptCode: "LAB" },
    { username: "radiographer", firstName: "Yaw", lastName: "Sarpong", email: "radio@jem.org", role: "radiographer", profRole: "Radiographer", deptCode: "RAD" },
    { username: "receptionist", firstName: "Akosua", lastName: "Frimpong", email: "front@jem.org", role: "receptionist", profRole: "Receptionist", deptCode: "OPD" },
    { username: "cashier", firstName: "Kofi", lastName: "Adjei", email: "cashier@jem.org", role: "cashier", profRole: "Cashier", deptCode: "FIN" },
    { username: "accountant", firstName: "Esi", lastName: "Darko", email: "accounts@jem.org", role: "accountant", profRole: "Accountant", deptCode: "FIN" },
    { username: "records", firstName: "Kojo", lastName: "Annan", email: "records@jem.org", role: "records_officer", profRole: "Medical Records Officer", deptCode: "RECORDS" },
    { username: "inventory", firstName: "Adwoa", lastName: "Tetteh", email: "stores@jem.org", role: "inventory_officer", profRole: "Inventory Officer", deptCode: "STORES" },
  ];

  for (const ud of usersData) {
    const existing = await prisma.user.findUnique({ where: { username: ud.username } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
      continue;
    }

    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        username: ud.username,
        email: ud.email,
        passwordHash,
        firstName: ud.firstName,
        lastName: ud.lastName,
        status: "active",
      },
    });

    const role = rolesByCode[ud.role];
    if (role) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          facilityId: facilities[0].id,
        },
      });
    }

    if (ud.profRole) {
      const staffNumber = `STF-${String(usersData.indexOf(ud) + 1).padStart(4, "0")}`;
      const staff = await prisma.staff.create({
        data: {
          userId: user.id,
          staffNumber,
          firstName: ud.firstName,
          lastName: ud.lastName,
          email: ud.email,
          professionalRole: ud.profRole,
          employmentStatus: "active",
          employmentType: "full_time",
          hireDate: new Date(),
        },
      });

      const facility = facilities[0];
      const department = await prisma.department.findFirst({ where: { facilityId: facility.id, code: ud.deptCode } });
      await prisma.staffFacility.create({
        data: {
          staffId: staff.id,
          facilityId: facility.id,
          departmentId: department?.id || null,
          position: ud.profRole,
          isPrimary: true,
          startDate: new Date(),
          status: "active",
        },
      });
    }
  }
  console.log(`✓ Default users: ${usersData.length} (password: Password@2026)`);

  const providersData = [
    { name: "National Health Insurance Scheme (NHIS)", code: "NHIS", phone: "+233 30 222 2333", email: "info@nhis.gov.gh", address: "Accra, Ghana" },
    { name: "Acacia Health Insurance", code: "AHIS", phone: "+233 30 999 8888", email: "info@acacia.com.gh", address: "Accra, Ghana" },
    { name: "Metropolitan Health Insurance", code: "MHIS", phone: "+233 30 555 6666", email: "info@metropolitan.com.gh", address: "Kumasi, Ghana" },
  ];
  for (const p of providersData) {
    await prisma.insuranceProvider.upsert({
      where: { organizationId_code: { organizationId: org.id, code: p.code } },
      update: {},
      create: { ...p, organizationId: org.id, status: "active" },
    });
  }
  console.log(`✓ Insurance providers: ${providersData.length}`);

  const labTestsData = [
    { name: "Full Blood Count", code: "CBC", category: "haematology", specimenType: "Whole Blood", unit: "cells/uL", referenceRange: "WBC 4-11, RBC 4.5-6.0, PLT 150-400", price: 30 },
    { name: "Hemoglobin", code: "HGB", category: "haematology", specimenType: "Whole Blood", unit: "g/dL", referenceRange: "Male 13-17, Female 12-15", price: 15 },
    { name: "Blood Group", code: "BG", category: "haematology", specimenType: "Whole Blood", unit: "", referenceRange: "A/B/AB/O +/- Rh", price: 20 },
    { name: "Fasting Blood Glucose", code: "FBG", category: "chemistry", specimenType: "Plasma", unit: "mg/dL", referenceRange: "70-100", price: 25 },
    { name: "Liver Function Test", code: "LFT", category: "chemistry", specimenType: "Serum", unit: "U/L", referenceRange: "ALT 7-56, AST 10-40", price: 80 },
    { name: "Kidney Function Test", code: "KFT", category: "chemistry", specimenType: "Serum", unit: "mg/dL", referenceRange: "Urea 7-20, Creatinine 0.6-1.2", price: 80 },
    { name: "Lipid Profile", code: "LIPID", category: "chemistry", specimenType: "Serum", unit: "mg/dL", referenceRange: "Total Chol <200, LDL <100, HDL >40", price: 90 },
    { name: "Urinalysis", code: "UA", category: "chemistry", specimenType: "Urine", unit: "", referenceRange: "pH 4.5-8, SG 1.005-1.030", price: 20 },
    { name: "Stool Routine", code: "STOOL", category: "microbiology", specimenType: "Stool", unit: "", referenceRange: "No ova/parasites", price: 25 },
    { name: "Widal Test", code: "WIDAL", category: "serology", specimenType: "Serum", unit: "", referenceRange: "<1:80", price: 40 },
    { name: "HIV Screening", code: "HIV", category: "serology", specimenType: "Serum", unit: "", referenceRange: "Non-reactive", price: 35 },
    { name: "Hepatitis B Surface Antigen", code: "HBSAG", category: "serology", specimenType: "Serum", unit: "", referenceRange: "Non-reactive", price: 40 },
    { name: "Malaria Parasite (Blood Film)", code: "MP", category: "microbiology", specimenType: "Whole Blood", unit: "", referenceRange: "No parasites seen", price: 20 },
    { name: "Pregnancy Test (Urine)", code: "PT", category: "chemistry", specimenType: "Urine", unit: "", referenceRange: "Negative", price: 15 },
    { name: "ESR", code: "ESR", category: "haematology", specimenType: "Whole Blood", unit: "mm/hr", referenceRange: "0-22", price: 25 },
  ];
  for (const t of labTestsData) {
    await prisma.laboratoryTest.upsert({
      where: { organizationId_code: { organizationId: org.id, code: t.code } },
      update: {},
      create: { ...t, organizationId: org.id, status: "active" },
    });
  }
  console.log(`✓ Lab tests: ${labTestsData.length}`);

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
  for (const s of servicesData) {
    const service = await prisma.service.upsert({
      where: { organizationId_code: { organizationId: org.id, code: s.code } },
      update: {},
      create: { ...s, organizationId: org.id, status: "active" },
    });
    for (const f of facilities) {
      await prisma.facilityServicePrice.upsert({
        where: { facilityId_serviceId: { facilityId: f.id, serviceId: service.id } },
        update: {},
        create: { facilityId: f.id, serviceId: service.id, price: s.defaultPrice, status: "active" },
      });
    }
  }
  console.log(`✓ Services: ${servicesData.length} (with facility pricing)`);

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
  for (const m of medsData) {
    const existing = await prisma.medication.findFirst({ where: { genericName: m.genericName, brandName: m.brandName } });
    if (existing) continue;
    await prisma.medication.create({
      data: { ...m, organizationId: org.id, status: "active" },
    });
  }
  console.log(`✓ Medications: ${medsData.length}`);

  const meds = await prisma.medication.findMany();
  for (const med of meds) {
    const existingItem = await prisma.inventoryItem.findFirst({ where: { medicationId: med.id } });
    if (existingItem) continue;
    const item = await prisma.inventoryItem.create({
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

    for (const f of facilities) {
      const fi = await prisma.facilityInventory.create({
        data: {
          facilityId: f.id,
          inventoryItemId: item.id,
          currentQuantity: 200,
          minimumQuantity: 50,
          maximumQuantity: 1000,
          storageLocation: "Pharmacy Store",
        },
      });

      await prisma.inventoryBatch.create({
        data: {
          facilityInventoryId: fi.id,
          batchNumber: `B-${med.id.slice(-4).toUpperCase()}-${f.code.slice(-3)}`,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          quantity: 200,
          costPrice: 0.5,
          sellingPrice: 1.0,
          receivedAt: new Date(),
          status: "active",
        },
      });

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
    }
  }

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
  for (const c of consumablesData) {
    const existing = await prisma.inventoryItem.findUnique({ where: { organizationId_sku: { organizationId: org.id, sku: c.sku } } });
    if (existing) continue;
    const item = await prisma.inventoryItem.create({
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

    for (const f of facilities) {
      const fi = await prisma.facilityInventory.create({
        data: {
          facilityId: f.id,
          inventoryItemId: item.id,
          currentQuantity: 100,
          minimumQuantity: c.reorderLevel,
          maximumQuantity: 500,
          storageLocation: "Main Store",
        },
      });
      await prisma.inventoryBatch.create({
        data: {
          facilityInventoryId: fi.id,
          batchNumber: `B-CONS-${c.sku.slice(-3)}-${f.code.slice(-3)}`,
          expiryDate: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000),
          quantity: 100,
          costPrice: 10,
          sellingPrice: 20,
          receivedAt: new Date(),
          status: "active",
        },
      });
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
    }
  }
  console.log(`✓ Inventory: ${meds.length} medications + ${consumablesData.length} consumables × ${facilities.length} facilities`);

  const suppliersData = [
    { name: "Ernest Chemist Limited", code: "ERN-CHM", contactPerson: "Ernest Osei", phone: "+233 30 222 4444", email: "sales@ernestchemist.com", address: "Accra, Ghana" },
    { name: "M&G Pharmaceuticals", code: "MG-PHARMA", contactPerson: "George Mensah", phone: "+233 30 333 5555", email: "info@mgpharma.com", address: "Tema, Ghana" },
    { name: "Kinapharma Limited", code: "KINA", contactPerson: "Kina Acheampong", phone: "+233 30 444 6666", email: "info@kinapharma.com", address: "Accra, Ghana" },
    { name: "Medlab Supplies Ltd", code: "MEDLAB-SUP", contactPerson: "Linda Owusu", phone: "+233 30 555 7777", email: "info@medlabsupplies.com", address: "Kumasi, Ghana" },
  ];
  for (const s of suppliersData) {
    await prisma.supplier.upsert({
      where: { organizationId_code: { organizationId: org.id, code: s.code } },
      update: {},
      create: { ...s, organizationId: org.id, status: "active" },
    });
  }
  console.log(`✓ Suppliers: ${suppliersData.length}`);

  const samplePatients = [
    { firstName: "Kwame", lastName: "Asante", sex: "male", dateOfBirth: new Date("1985-06-15"), phone: "+233244111222", bloodGroup: "O+", address: "Spintex, Accra" },
    { firstName: "Abena", lastName: "Fosu", sex: "female", dateOfBirth: new Date("1990-09-22"), phone: "+233244333444", bloodGroup: "A+", address: "Madina, Accra" },
    { firstName: "Yaw", lastName: "Prempeh", sex: "male", dateOfBirth: new Date("1978-03-10"), phone: "+233244555666", bloodGroup: "B+", address: "Tema Community 1" },
  ];
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

    await prisma.patientContact.create({
      data: {
        patientId: patient.id,
        name: i === 0 ? "Adwoa Asante" : i === 1 ? "Kofi Fosu" : "Ama Prempeh",
        relationship: "spouse",
        phone: "+233244999000",
        isPrimary: true,
      },
    });

    const nhis = await prisma.insuranceProvider.findFirst({ where: { organizationId: org.id, code: "NHIS" } });
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
  console.log(`✓ Sample patients: ${samplePatients.length}`);

  console.log("\n✅ Seeding complete!");
  console.log("\n📋 Default credentials (password: Password@2026):");
  console.log("   superadmin / orgadmin / facadmin / doctor / nurse / pharmacist");
  console.log("   labscientist / radiographer / receptionist / cashier / accountant / records / inventory");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
