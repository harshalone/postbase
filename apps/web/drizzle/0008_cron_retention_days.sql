ALTER TABLE "_postbase"."cron_jobs" ADD COLUMN IF NOT EXISTS "retention_days" integer DEFAULT 3;
ALTER TABLE "_postbase"."cron_jobs" ALTER COLUMN "retention_days" SET DEFAULT 3;
UPDATE "_postbase"."cron_jobs" SET "retention_days" = 3 WHERE "retention_days" IS NULL;
