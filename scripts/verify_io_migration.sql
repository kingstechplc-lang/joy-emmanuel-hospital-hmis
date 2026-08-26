-- Verification query: list the new tables and new columns
-- Run against the Neon database to confirm the migration applied.
SELECT 'TABLES' AS section, tablename AS object_name
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('IntakeOutputEntry',
                    'IntakeOutputMonitoringPeriod',
                    'IntakeOutputAlertConfig',
                    'IntakeOutputAlert')
ORDER BY tablename;

SELECT 'COLUMNS on IntakeOutputEntry' AS section, column_name AS object_name, data_type
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

SELECT 'INDEXES on IntakeOutputEntry' AS section, indexname AS object_name
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'IntakeOutputEntry'
  AND indexname LIKE 'IntakeOutputEntry_%_idx'
ORDER BY indexname;
