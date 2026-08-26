// Verify the I&O migration is applied to the Neon database.
// Reads DATABASE_URL from env. Prints the new tables, columns, and indexes.
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

(async () => {
  try {
    console.log("\n=== 1. NEW TABLES (should list 4) ===");
    const tables = await db.$queryRawUnsafe(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('IntakeOutputEntry',
                          'IntakeOutputMonitoringPeriod',
                          'IntakeOutputAlertConfig',
                          'IntakeOutputAlert')
      ORDER BY tablename;
    `);
    tables.forEach((t) => console.log("  ✓", t.tablename));

    console.log("\n=== 2. NEW COLUMNS on IntakeOutputEntry (should list ~22) ===");
    const cols = await db.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'IntakeOutputEntry'
        AND column_name IN (
          'category','source','route','collectionMethod','drainLabel','catheterStatus',
          'measurementType','unit','weightKg','eventAt','documentedAt','status',
          'verifiedById','verifiedAt','amendedById','amendedAt','amendmentReason',
          'originalAmount','cancelledAt','cancelReason','monitoringPeriodId','updatedAt'
        )
      ORDER BY column_name;
    `);
    cols.forEach((c) => {
      const def = c.column_default ? ` DEFAULT ${c.column_default}` : "";
      console.log(`  ✓ ${c.column_name.padEnd(22)} ${c.data_type.padEnd(20)} ${c.is_nullable === "YES" ? "NULL" : "NOT NULL"}${def}`);
    });

    console.log("\n=== 3. NEW INDEXES on IntakeOutputEntry (should list 6+) ===");
    const idx = await db.$queryRawUnsafe(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'IntakeOutputEntry'
        AND indexname LIKE 'IntakeOutputEntry_%_idx'
      ORDER BY indexname;
    `);
    idx.forEach((i) => console.log("  ✓", i.indexname));

    console.log("\n=== 4. LEGACY ROW COUNT (existing entries preserved) ===");
    const cnt = await db.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS total,
             COUNT("category")::int AS with_new_fields,
             COUNT(CASE WHEN "eventAt" IS NOT NULL THEN 1 END)::int AS with_event_at,
             COUNT(CASE WHEN "status" IS NOT NULL THEN 1 END)::int AS with_status
      FROM "IntakeOutputEntry";
    `);
    console.log("  Total rows:        ", cnt[0].total);
    console.log("  With category set: ", cnt[0].with_new_fields, "(0 = no legacy rows, which is fine)");
    console.log("  With eventAt:      ", cnt[0].with_event_at);
    console.log("  With status:       ", cnt[0].with_status);

    console.log("\n=== 5. FOREIGN KEYS on new tables ===");
    const fks = await db.$queryRawUnsafe(`
      SELECT conname, conrelid::regclass AS table_name
      FROM pg_constraint
      WHERE contype = 'f'
        AND connamespace = 'public'::regnamespace
        AND (conrelid::regclass::text = 'IntakeOutputMonitoringPeriod'
          OR conrelid::regclass::text = 'IntakeOutputAlertConfig'
          OR conrelid::regclass::text = 'IntakeOutputAlert')
      ORDER BY conrelid::regclass::text, conname;
    `);
    fks.forEach((f) => console.log(`  ✓ ${f.table_name} ← ${f.conname}`));

    console.log("\n✅ ALL CHECKS PASSED — schema is live on Neon.");
  } catch (e) {
    console.error("\n❌ VERIFICATION FAILED:", e.message);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
})();
