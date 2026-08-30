// Quick Neon DB connection check using Prisma's @prisma/client
// (avoids needing psql installed)
import { PrismaClient } from "@prisma/client";

const DATABASE_URL = "postgresql://neondb_owner:npg_cFAN93LwhkXs@ep-falling-firefly-ayrc50s1-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
  log: ["error", "warn"],
});

async function main() {
  console.log("Connecting to Neon Postgres...");
  await prisma.$connect();
  console.log("✓ Connected\n");

  // Raw SQL queries to inspect DB state
  const tables: any[] = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  console.log(`Total tables in 'public' schema: ${tables.length}`);

  const sampleTableNames = tables.slice(0, 25).map((t: any) => t.table_name);
  console.log("\nFirst 25 tables (alphabetical):");
  sampleTableNames.forEach((n: string, i: number) => console.log(`  ${i + 1}. ${n}`));

  const prismaMigrations: any[] = await prisma.$queryRaw`
    SELECT count(*)::int AS cnt
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
  `;
  const hasMigrationsTable = prismaMigrations[0]?.cnt > 0;
  console.log(`\n_prisma_migrations table exists: ${hasMigrationsTable ? "YES" : "NO"}`);

  const nhiaCheck: any[] = await prisma.$queryRaw`
    SELECT count(*)::int AS cnt
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'NhiaClaimExport'
  `;
  const hasNhiaTable = nhiaCheck[0]?.cnt > 0;
  console.log(`NhiaClaimExport table exists: ${hasNhiaTable ? "YES (already migrated)" : "NO (needs migration)"}`);

  if (hasMigrationsTable) {
    const migrations: any[] = await prisma.$queryRaw`
      SELECT migration_name, finished_at IS NOT NULL AS applied
      FROM "_prisma_migrations"
      ORDER BY started_at DESC
      LIMIT 5
    `;
    console.log("\nLast 5 migrations:");
    migrations.forEach((m: any) => console.log(`  ${m.applied ? "✓" : "✗"} ${m.migration_name}`));
  }

  console.log("\n--- DONE ---");
}

main()
  .catch((e) => {
    console.error("✗ ERROR:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
