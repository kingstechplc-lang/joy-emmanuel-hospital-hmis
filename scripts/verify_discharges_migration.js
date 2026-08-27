// Verify the discharges schema migration is applied to the Neon database.
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

(async () => {
  try {
    console.log("\n=== 1. NEW TABLES ===");
    const tables = await db.$queryRawUnsafe(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('DischargeRecord', 'DischargeChecklistItem', 'DischargeMedication')
      ORDER BY tablename;
    `);
    tables.forEach((t) => console.log("  ✓", t.tablename));

    console.log("\n=== 2. NEW COLUMNS on DischargeRecord (sampling) ===");
    const cols = await db.$queryRawUnsafe(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'DischargeRecord'
        AND column_name IN ('dischargeNumber', 'status', 'requestedById', 'approvedById', 'finalizedById', 'isFinalized', 'facilityId', 'damaReason', 'transferReceivingFacility', 'deathDate', 'instructionsMedication')
      ORDER BY column_name;
    `);
    cols.forEach((c) => console.log(`  ✓ ${c.column_name.padEnd(30)} ${c.data_type}`));

    console.log("\n=== 3. USER BACK-RELATIONS (sample) ===");
    const userCols = await db.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'User'
        AND column_name LIKE 'discharges%'
      ORDER BY column_name;
    `);
    console.log("  (Back-relations are virtual in Prisma — not actual columns. Skipping.)");

    console.log("\n=== 4. TEST QUERY — list discharges ===");
    const count = await db.dischargeRecord.count();
    console.log("  ✓ dischargeRecord.count() =", count);

    console.log("\n=== 5. TEST QUERY — list with includes (like the API does) ===");
    const items = await db.dischargeRecord.findMany({
      take: 1,
      include: {
        patient: { select: { id: true, firstName: true } },
        admission: { select: { id: true, admissionNumber: true } },
        dischargedBy: { select: { id: true } },
        requestedBy: { select: { id: true } },
        approvedBy: { select: { id: true } },
        cancelledBy: { select: { id: true } },
        finalizedBy: { select: { id: true } },
      },
    });
    console.log("  ✓ findMany with includes succeeded, count:", items.length);

    console.log("\n=== 6. TEST QUERY — stats endpoint query ===");
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const stats = await db.dischargeRecord.count({
      where: { dischargedAt: { gte: todayStart, lte: todayEnd }, isFinalized: true },
    });
    console.log("  ✓ stats query succeeded, today's discharges:", stats);

    console.log("\n✅ ALL CHECKS PASSED — schema is live and queries work.");
  } catch (e) {
    console.error("\n❌ VERIFICATION FAILED:", e.message);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
})();
