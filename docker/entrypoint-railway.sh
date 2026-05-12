#!/bin/bash
set -e

PORT="${PORT:-3000}"
export PORT

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Link the Postgres service in Railway." >&2
  exit 1
fi

# ── Run migrations against external DATABASE_URL ─────────────────────────────
echo "==> Running database migrations..."
for f in $(ls /app/drizzle/*.sql | sort); do
    echo "  -> $(basename $f)"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

# ── Incremental schema patches (idempotent) ───────────────────────────────────
echo "==> Applying schema patches..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE "_postbase"."email_settings" ADD COLUMN IF NOT EXISTS "ses_smtp_username" text;
ALTER TABLE "_postbase"."email_settings" ADD COLUMN IF NOT EXISTS "ses_smtp_password" text;

-- Drop FK constraints before migration 0003 attempts to drop the shared auth tables
ALTER TABLE "_postbase"."storage_objects" DROP CONSTRAINT IF EXISTS "storage_objects_owner_id_users_id_fk";
ALTER TABLE "_postbase"."audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_user_id_users_id_fk";

-- Remove user_column_defs from projects if it somehow didn't get applied
ALTER TABLE "_postbase"."projects" ADD COLUMN IF NOT EXISTS "user_column_defs" jsonb DEFAULT '[]'::jsonb;

-- Cron jobs (node-cron backed, replaces pg_cron)
CREATE TABLE IF NOT EXISTS "_postbase"."cron_jobs" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id"  uuid NOT NULL REFERENCES "_postbase"."projects"("id") ON DELETE CASCADE,
  "name"        text NOT NULL,
  "schedule"    text NOT NULL,
  "command"     text NOT NULL,
  "active"      boolean NOT NULL DEFAULT true,
  "created_at"  timestamp NOT NULL DEFAULT now(),
  "updated_at"  timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "cron_jobs_project_idx" ON "_postbase"."cron_jobs" ("project_id");
CREATE INDEX IF NOT EXISTS "cron_jobs_project_name_idx" ON "_postbase"."cron_jobs" ("project_id", "name");

CREATE TABLE IF NOT EXISTS "_postbase"."cron_job_runs" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id"          uuid NOT NULL REFERENCES "_postbase"."cron_jobs"("id") ON DELETE CASCADE,
  "start_time"      timestamp NOT NULL DEFAULT now(),
  "end_time"        timestamp,
  "status"          text NOT NULL DEFAULT 'running',
  "return_message"  text
);
CREATE INDEX IF NOT EXISTS "cron_job_runs_job_idx" ON "_postbase"."cron_job_runs" ("job_id");
CREATE INDEX IF NOT EXISTS "cron_job_runs_start_time_idx" ON "_postbase"."cron_job_runs" ("start_time");
SQL
echo "==> Migrations done."

# ── Seed (idempotent) ─────────────────────────────────────────────────────────
if [ -f /docker-entrypoint-initdb.d/seed.sql ]; then
    echo "==> Seeding..."
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/seed.sql
    echo "==> Seed done."
fi

# ── Start Next.js ─────────────────────────────────────────────────────────────
# HOSTNAME=0.0.0.0 is required — standalone server binds to localhost by default
# which Railway's proxy cannot reach
exec env HOSTNAME=0.0.0.0 node /app/apps/web/server.js
