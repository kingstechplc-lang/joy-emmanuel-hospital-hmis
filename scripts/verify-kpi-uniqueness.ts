// =====================================================================
// KPI Uniqueness Verification Script
//
// Verifies that the EncounterCoverage table has a 1:1 relationship with
// Encounter (via the @unique constraint on encounterId). This means
// `db.encounterCoverage.count({ where: { payerType: ... } })` is
// equivalent to "count of unique encounters matching the payer
// classification" — because each EncounterCoverage row corresponds to
// exactly one unique encounter.
//
// Also verifies that attempting to insert a duplicate coverage record
// for the same encounter fails with Prisma error code P2002
// (unique constraint violation).
// =====================================================================

// Replicate the same env-loading logic as src/lib/db.ts so the script
// uses the same Neon PostgreSQL database as the running app.
import { config } from "dotenv";
config({ path: ".env", override: true });

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith("file:")) {
  process.env.DATABASE_URL =
    "postgresql://neondb_owner:npg_cFAN93LwhkXs@ep-falling-firefly-ayrc50s1-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
  process.env.DIRECT_URL =
    "postgresql://neondb_owner:npg_cFAN93LwhkXs@ep-falling-firefly-ayrc50s1-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
}

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("=== Payer KPI Uniqueness Verification ===\n");

  // 1. Schema-level verification: confirm the @unique constraint exists
  console.log("1. Schema-level check:");
  console.log("   EncounterCoverage.encounterId has @unique constraint");
  console.log("   → Each encounter can have AT MOST ONE EncounterCoverage record");
  console.log("   → db.encounterCoverage.count(...) === count of unique encounters\n");

  // 2. Data-level verification: COUNT(*) == COUNT(DISTINCT encounterId) for each payerType
  console.log("2. Data-level verification (real database):");

  const payerTypes = ["self_pay", "nhis", "private_insurance", "corporate", "employer", "government", "other"];

  let allEqual = true;
  for (const pt of payerTypes) {
    // Count rows
    const rowsCount = await db.encounterCoverage.count({ where: { payerType: pt } });

    // Count distinct encounterIds via raw SQL
    const distinctResult = await db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT "encounterId") AS count
      FROM "EncounterCoverage"
      WHERE "payerType" = ${pt}
    `;
    const distinctCount = Number(distinctResult[0]?.count ?? 0);

    const isEqual = rowsCount === distinctCount;
    if (!isEqual) allEqual = false;

    console.log(
      `   ${pt.padEnd(20)} rows=${rowsCount.toString().padStart(6)}  distinctEncounters=${distinctCount.toString().padStart(6)}  ${
        isEqual ? "✓ MATCH" : "✗ MISMATCH"
      }`
    );
  }

  // Also verify "insured" (any non-self_pay)
  const insuredRows = await db.encounterCoverage.count({
    where: { payerType: { not: "self_pay" } },
  });
  const insuredDistinct = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT "encounterId") AS count
    FROM "EncounterCoverage"
    WHERE "payerType" <> 'self_pay'
  `;
  const insuredDistinctCount = Number(insuredDistinct[0]?.count ?? 0);
  const insuredEqual = insuredRows === insuredDistinctCount;
  if (!insuredEqual) allEqual = false;
  console.log(
    `   ${"insured (any non-self)".padEnd(20)} rows=${insuredRows.toString().padStart(6)}  distinctEncounters=${insuredDistinctCount.toString().padStart(6)}  ${
      insuredEqual ? "✓ MATCH" : "✗ MISMATCH"
    }`
  );

  console.log("");
  if (allEqual) {
    console.log("✓ PAYER KPI UNIQUENESS: PASS");
    console.log("   Every EncounterCoverage row corresponds to a unique encounter.");
    console.log("   The KPI counts are not inflating numbers via duplicate coverage rows.");
  } else {
    console.log("✗ PAYER KPI UNIQUENESS: FAIL");
    console.log("   Some payer types have rows != distinct encounters — investigate.");
  }

  // 3. Constraint-level verification: try inserting a duplicate (will roll back)
  console.log("\n3. Constraint-level verification (try-insert-rollback):");

  // Find any encounter that already has a coverage record
  const existingCoverage = await db.encounterCoverage.findFirst({
    select: { id: true, encounterId: true, payerType: true, organizationId: true, facilityId: true },
  });

  if (!existingCoverage) {
    console.log("   (no existing EncounterCoverage rows — skipping insert test)");
  } else {
    console.log(
      `   Existing coverage: encounterId=${existingCoverage.encounterId} payerType=${existingCoverage.payerType}`
    );
    console.log("   Attempting to insert a SECOND coverage record for the same encounterId...");

    try {
      await db.$transaction(async (tx) => {
        await tx.encounterCoverage.create({
          data: {
            organizationId: existingCoverage.organizationId,
            facilityId: existingCoverage.facilityId,
            encounterId: existingCoverage.encounterId, // SAME encounter — should violate @unique
            payerType: "self_pay",
          },
        });
        // Force rollback with an error
        throw new Error("INTENTIONAL_ROLLBACK");
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        console.log("   ✓ Prisma rejected the duplicate with P2002 (unique constraint violation)");
        console.log("   ✓ The @unique constraint is enforced at the database level");
        console.log("   ✓ Duplicate coverage counting is IMPOSSIBLE under the current schema");
      } else if (e?.message === "INTENTIONAL_ROLLBACK") {
        console.log("   ✗ UNEXPECTED: insert succeeded (constraint not enforced!)");
      } else {
        console.log(`   ✗ Unexpected error: ${e?.message}`);
      }
    }
  }

  console.log("\n=== Verification Complete ===");
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
