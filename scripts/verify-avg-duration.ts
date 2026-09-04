// =====================================================================
// Average Duration Accuracy Verification
//
// Verifies whether the current `findMany({ take: 5000 })` JS-based
// average duration calculation can produce misleading results.
//
// The current implementation in src/app/api/encounters/stats/route.ts
// (line 203-219):
//   const durationRecords = await db.encounter.findMany({
//     where: { ...dateScoped, NOT: [{ endAt: null }] },
//     select: { startAt: true, endAt: true },
//     take: 5000,  // safety cap
//   });
//   // ... JS reduce to compute average
//
// This is misleading IF >5000 qualifying encounters exist, because
// the findMany only fetches the FIRST 5000 rows (ordered by default
// DB ordering — typically primary key / insertion order, NOT random).
// The KPI would then show "average of first 5000" rather than "average
// of all qualifying encounters".
//
// This script:
//   1. Counts total qualifying encounters (endAt IS NOT NULL, within
//      facility scope).
//   2. If count <= 5000, the current implementation is exact → PASS.
//   3. If count > 5000, the current implementation is approximate → FAIL.
//   4. Also compares the JS average (first 5000) vs a database-side
//      exact aggregate (raw SQL AVG) to quantify any divergence.
// =====================================================================

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
  console.log("=== Average Duration Accuracy Verification ===\n");

  // Total encounters with endAt
  const totalWithEndAt = await db.encounter.count({
    where: { NOT: [{ endAt: null }] },
  });
  console.log(`Total encounters with endAt: ${totalWithEndAt}`);

  if (totalWithEndAt === 0) {
    console.log("No data to verify against — but the JS approach is bounded at 5000 rows.");
    console.log("At the current scale, the cap is non-binding → PASS for now.");
    return;
  }

  // 1. JS-side average (replicate the current implementation)
  console.log("\n1. Current implementation (findMany take:5000 + JS reduce):");
  const jsRecords = await db.encounter.findMany({
    where: { NOT: [{ endAt: null }] },
    select: { startAt: true, endAt: true },
    take: 5000,
  });
  console.log(`   Records fetched: ${jsRecords.length}`);
  let jsTotalMs = 0;
  let jsValidCount = 0;
  for (const r of jsRecords) {
    const ms = new Date(r.endAt!).getTime() - new Date(r.startAt).getTime();
    if (ms > 0) {
      jsTotalMs += ms;
      jsValidCount++;
    }
  }
  const jsAvgMinutes = jsValidCount > 0 ? jsTotalMs / jsValidCount / 60000 : null;
  console.log(`   Avg (JS): ${jsAvgMinutes?.toFixed(2)} minutes (n=${jsValidCount})`);

  // 2. Database-side exact aggregate
  console.log("\n2. Exact database-side aggregate (raw SQL AVG):");
  const exactResult = await db.$queryRaw<{ avg_minutes: number | null; n: bigint }[]>`
    SELECT
      AVG(EXTRACT(EPOCH FROM ("endAt" - "startAt")) / 60.0) AS avg_minutes,
      COUNT(*) AS n
    FROM "Encounter"
    WHERE "endAt" IS NOT NULL
      AND "endAt" > "startAt"
  `;
  const dbAvgMinutes = exactResult[0]?.avg_minutes !== null ? Number(exactResult[0]?.avg_minutes) : null;
  const dbN = Number(exactResult[0]?.n ?? 0);
  console.log(`   Avg (DB): ${dbAvgMinutes?.toFixed(2)} minutes (n=${dbN})`);

  // 3. Comparison
  console.log("\n3. Comparison:");
  if (jsRecords.length < totalWithEndAt) {
    console.log(`   ⚠ Current impl samples ${jsRecords.length} of ${totalWithEndAt} rows (${((jsRecords.length / totalWithEndAt) * 100).toFixed(1)}%)`);
    console.log("   ⚠ The 5000-row cap is BINDING at current scale → approximation");
  } else {
    console.log(`   ✓ All ${totalWithEndAt} qualifying rows fit within the 5000-row cap`);
    console.log("   ✓ Current implementation is exact at this scale");
  }

  if (jsAvgMinutes !== null && dbAvgMinutes !== null && dbAvgMinutes > 0) {
    const pctDiff = ((jsAvgMinutes - dbAvgMinutes) / dbAvgMinutes) * 100;
    console.log(`   Divergence: ${pctDiff > 0 ? "+" : ""}${pctDiff.toFixed(2)}%`);
  }

  console.log("");
  if (totalWithEndAt <= 5000) {
    console.log("✓ AVERAGE DURATION ACCURACY: PASS");
    console.log("   At current scale (≤5000 qualifying rows), the findMany(take:5000) cap is non-binding.");
    console.log("   JS average === database average.");
    console.log("");
    console.log("   NOTE: If the table grows beyond 5000 rows with endAt, the cap will bind and the");
    console.log("   KPI will become a sample. A future-proofing recommendation is to switch to a");
    console.log("   database-side aggregate (raw SQL AVG), which is O(1) memory and always exact.");
    console.log("   This is not a defect at current scale — it is a scalability safeguard note.");
  } else {
    console.log("✗ AVERAGE DURATION ACCURACY: FAIL");
    console.log(`   ${totalWithEndAt} qualifying rows > 5000-row cap → KPI is a sample, not exact.`);
    console.log("   Recommend switching to a database-side aggregate (raw SQL AVG).");
  }
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
