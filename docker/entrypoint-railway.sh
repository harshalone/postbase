#!/bin/bash
# Note: intentionally NOT using `set -e`. A migration hiccup must not prevent the
# web server from starting — otherwise Railway's healthcheck gets "service
# unavailable" (nothing listening) instead of a readable error, and the deploy
# loops for the full healthcheck window.
set -uo pipefail

PORT="${PORT:-3000}"
export PORT

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Link the Postgres service in Railway." >&2
  exit 1
fi

# ── Wait for Postgres to accept connections ──────────────────────────────────
# On a fresh Railway deploy the Postgres service may not be ready the instant
# this container starts. Retry for up to ~60s before giving up on migrations.
echo "==> Waiting for database to become reachable..."
db_ready=0
for attempt in $(seq 1 30); do
  if psql "$DATABASE_URL" -tAc 'SELECT 1' >/dev/null 2>&1; then
    db_ready=1
    echo "==> Database is reachable (attempt ${attempt})."
    break
  fi
  echo "  -> not ready yet (attempt ${attempt}/30), retrying in 2s..."
  sleep 2
done

if [ "$db_ready" -ne 1 ]; then
  echo "WARNING: database not reachable after retries. Starting server anyway;" >&2
  echo "         /api/health will report 503 until the DB is up." >&2
fi

# ── Run migrations (best-effort; failures are logged, not fatal) ──────────────
run_sql() {
  # $1 = description, remaining args passed to psql
  local desc="$1"; shift
  echo "  -> ${desc}"
  if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "$@"; then
    echo "WARNING: '${desc}' failed. Continuing so the server can still start." >&2
    return 1
  fi
}

if [ "$db_ready" -eq 1 ]; then
  echo "==> Running database migrations..."
  for f in $(ls /app/drizzle/*.sql 2>/dev/null | sort); do
    run_sql "$(basename "$f")" -f "$f"
  done

  # ── Incremental schema patches (idempotent) ────────────────────────────────
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
  if [ $? -ne 0 ]; then
    echo "WARNING: schema patches failed. Continuing so the server can still start." >&2
  fi
  echo "==> Migrations done."

  # ── Seed (idempotent) ──────────────────────────────────────────────────────
  if [ -f /docker-entrypoint-initdb.d/seed.sql ]; then
    echo "==> Seeding..."
    run_sql "seed.sql" -f /docker-entrypoint-initdb.d/seed.sql
    echo "==> Seed done."
  fi
else
  echo "==> Skipping migrations: database was not reachable."
fi

# ── Start Next.js ────────────────────────────────────────────────────────────
# HOSTNAME=0.0.0.0 is required — standalone server binds to localhost by default
# which Railway's proxy cannot reach.
echo "==> Starting Next.js server on 0.0.0.0:${PORT}..."
exec env HOSTNAME=0.0.0.0 node /app/apps/web/server.js
