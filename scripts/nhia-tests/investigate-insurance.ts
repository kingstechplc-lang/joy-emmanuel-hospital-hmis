// Investigate PatientInsurance records in Neon DB
// Find the patient with membership number 34578923 (from screenshot)
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("=== Searching for PatientInsurance with membershipNumber containing '34578923' ===\n");

  const insurances = await prisma.patientInsurance.findMany({
    where: { membershipNumber: { contains: "34578923" } },
    include: {
      patient: { select: { id: true, patientNumber: true, firstName: true, lastName: true, organizationId: true, status: true } },
      insuranceProvider: { select: { id: true, name: true, code: true, providerType: true, organizationId: true, status: true } },
    },
  });

  console.log(`Found ${insurances.length} PatientInsurance record(s) with membershipNumber containing '34578923':\n`);

  for (const ins of insurances) {
    console.log(`--- PatientInsurance ID: ${ins.id} ---`);
    console.log(`  membershipNumber: ${ins.membershipNumber}`);
    console.log(`  policyNumber: ${ins.policyNumber}`);
    console.log(`  principalMember: ${ins.principalMember}`);
    console.log(`  relationshipToPrincipal: ${ins.relationshipToPrincipal}`);
    console.log(`  coverageStart: ${ins.coverageStart}`);
    console.log(`  coverageEnd: ${ins.coverageEnd}`);
    console.log(`  verificationStatus: ${ins.verificationStatus}`);
    console.log(`  status: ${ins.status}`);
    console.log(`  createdAt: ${ins.createdAt}`);
    console.log(`  patient.id: ${ins.patient.id}`);
    console.log(`  patient.patientNumber: ${ins.patient.patientNumber}`);
    console.log(`  patient.name: ${ins.patient.firstName} ${ins.patient.lastName}`);
    console.log(`  patient.organizationId: ${ins.patient.organizationId}`);
    console.log(`  patient.status: ${ins.patient.status}`);
    console.log(`  insuranceProvider.id: ${ins.insuranceProvider?.id || "MISSING"}`);
    console.log(`  insuranceProvider.name: ${ins.insuranceProvider?.name || "MISSING"}`);
    console.log(`  insuranceProvider.code: ${ins.insuranceProvider?.code || "MISSING"}`);
    console.log(`  insuranceProvider.providerType: ${ins.insuranceProvider?.providerType || "MISSING"}`);
    console.log(`  insuranceProvider.organizationId: ${ins.insuranceProvider?.organizationId || "MISSING"}`);
    console.log(`  insuranceProvider.status: ${ins.insuranceProvider?.status || "MISSING"}`);
    console.log();
  }

  // Also check: what does /api/patients/[id] return for this patient?
  if (insurances.length > 0) {
    const patientId = insurances[0].patient.id;
    console.log(`\n=== Simulating /api/patients/${patientId} insurance include ===\n`);

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: { insurance: { include: { insuranceProvider: true } } },
    });

    console.log(`Patient found: ${patient ? "YES" : "NO"}`);
    console.log(`patient.insurance array length: ${patient?.insurance?.length || 0}`);
    if (patient?.insurance) {
      for (const ins of patient.insurance) {
        console.log(`  - id=${ins.id}, membershipNumber=${ins.membershipNumber}, status=${ins.status}, provider=${ins.insuranceProvider?.name || "null"}`);
      }
    }
  }

  // Check ALL patient insurances in the DB to understand the data
  console.log(`\n=== ALL PatientInsurance records (last 10) ===\n`);
  const allIns = await prisma.patientInsurance.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      patient: { select: { patientNumber: true, firstName: true, lastName: true } },
      insuranceProvider: { select: { name: true, code: true } },
    },
  });
  for (const ins of allIns) {
    console.log(`  ${ins.id} | member#${ins.membershipNumber} | status=${ins.status} | patient=${ins.patient?.patientNumber} | provider=${ins.insuranceProvider?.name || "NULL"}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
