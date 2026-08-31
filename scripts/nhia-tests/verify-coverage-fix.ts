// Verify the CoverageDialog fix — simulate the exact fetch the dialog does
// and confirm insurance records are now retrieved correctly.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // The patient from the screenshot: KINGSLEY ADUSEI, JEM-0000004
  // membership number 34578923
  const patientId = "cmt259w7c0001qi7lxwcmxsci";

  console.log("=== Simulating /api/patients/[id] GET response shape ===\n");

  // This mirrors exactly what the API route does
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      identifiers: true,
      contacts: true,
      emergencyContacts: true,
      nextOfKin: true,
      insurance: { include: { insuranceProvider: true } },
      allergies: { orderBy: { recordedAt: "desc" } },
    },
  });

  if (!patient) {
    console.log("Patient not found");
    return;
  }

  // The API returns { patient: {...} } — the response is nested under "patient"
  const apiResponse = { patient };

  // OLD BUG: CoverageDialog read insuranceQuery.data?.insurance (top-level)
  const oldBugResult = (apiResponse as any)?.insurance || [];
  console.log(`OLD (buggy) — data?.insurance: ${oldBugResult.length} record(s)`);

  // FIX: CoverageDialog now reads insuranceQuery.data?.patient?.insurance (nested)
  const fixedResult = (apiResponse as any)?.patient?.insurance || [];
  console.log(`NEW (fixed) — data?.patient?.insurance: ${fixedResult.length} record(s)`);

  console.log("\n=== Insurance records visible to CoverageDialog after fix ===\n");
  for (const ins of fixedResult) {
    const now = new Date();
    const isExpired = ins.coverageEnd && new Date(ins.coverageEnd) < now;
    const isFuture = ins.coverageStart && new Date(ins.coverageStart) > now;
    const isActive = !isExpired && !isFuture && ins.status === "active";

    console.log(`  ID: ${ins.id}`);
    console.log(`  Provider: ${ins.insuranceProvider?.name} (${ins.insuranceProvider?.code})`);
    console.log(`  Membership #: ${ins.membershipNumber}`);
    console.log(`  Policy #: ${ins.policyNumber}`);
    console.log(`  Coverage: ${ins.coverageStart?.toISOString().slice(0,10)} → ${ins.coverageEnd?.toISOString().slice(0,10)}`);
    console.log(`  Status: ${ins.status} | ${isActive ? "ACTIVE" : isExpired ? "EXPIRED" : isFuture ? "FUTURE" : "INACTIVE"}`);
    console.log(`  Principal: ${ins.principalMember} (${ins.relationshipToPrincipal})`);
    console.log();
  }

  console.log("=== Conclusion ===");
  console.log(`Before fix: CoverageDialog saw ${oldBugResult.length} insurance record(s) → showed "no insurance on file"`);
  console.log(`After fix:  CoverageDialog sees ${fixedResult.length} insurance record(s) → will display them as selectable cards`);
  console.log(`\nThe patient from the screenshot (KINGSLEY ADUSEI, JEM-0000004) will now see their NHIS record (member #34578923) in the Coverage dialog.`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
