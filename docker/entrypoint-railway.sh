#!/bin/bash
set -e

PORT="${PORT:-3000}"
export PORT

# ── Run migrations against external DATABASE_URL ─────────────────────────────
echo "==> Running database migrations..."
for f in $(ls /app/drizzle/*.sql | sort); do
    echo "  -> $(basename $f)"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
echo "==> Migrations done."

# ── Seed (idempotent) ─────────────────────────────────────────────────────────
if [ -f /docker-entrypoint-initdb.d/seed.sql ]; then
    echo "==> Seeding..."
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/seed.sql
    echo "==> Seed done."
fi

# ── Start Next.js ─────────────────────────────────────────────────────────────
exec node /app/apps/web/server.js
