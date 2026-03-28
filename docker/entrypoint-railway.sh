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
