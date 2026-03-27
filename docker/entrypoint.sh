#!/bin/bash
set -e

# ── Defaults ──────────────────────────────────────────────────────────────────
POSTGRES_USER="${POSTGRES_USER:-postbase}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postbase}"
POSTGRES_DB="${POSTGRES_DB:-postbase}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-postbase}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-postbase_secret}"
PORT="${PORT:-3000}"
export PORT

export MINIO_ROOT_USER MINIO_ROOT_PASSWORD
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"

# ── Postgres data dir ─────────────────────────────────────────────────────────
mkdir -p /data/postgres
chown -R postgres:postgres /data/postgres

# Remove stale pid file from previous unclean shutdown (Railway restarts)
rm -f /data/postgres/postmaster.pid

# Initialise if no PG_VERSION file (fresh or incomplete previous init)
if [ ! -f /data/postgres/PG_VERSION ]; then
    echo "==> Initialising PostgreSQL data directory..."
    gosu postgres /usr/lib/postgresql/18/bin/initdb \
        -D /data/postgres \
        --username="$POSTGRES_USER" \
        --auth-local=trust \
        --auth-host=md5

    echo "shared_preload_libraries = 'pg_cron'" >> /data/postgres/postgresql.conf
    echo "cron.database_name = '$POSTGRES_DB'"  >> /data/postgres/postgresql.conf
    echo "host all all 127.0.0.1/32 md5"        >> /data/postgres/pg_hba.conf
fi

# Start Postgres temporarily for all init work
gosu postgres /usr/lib/postgresql/18/bin/pg_ctl -D /data/postgres -w start

# Set password (connect via template1 which always exists)
gosu postgres psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname template1 \
    -c "ALTER USER \"$POSTGRES_USER\" WITH PASSWORD '$POSTGRES_PASSWORD';"

# Create DB if it doesn't exist
DB_EXISTS=$(gosu postgres psql --username "$POSTGRES_USER" --dbname template1 -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'")
if [ "$DB_EXISTS" != "1" ]; then
    echo "==> Creating database $POSTGRES_DB..."
    gosu postgres psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname template1 \
        -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";"
    gosu postgres psql -v ON_ERROR_STOP=1 \
        --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
        -f /docker-entrypoint-initdb.d/init.sql
    echo "==> Database initialised."
fi

# ── Run migrations (idempotent SQL files via psql) ────────────────────────────
echo "==> Running database migrations..."
for f in $(ls /app/drizzle/*.sql | sort); do
    echo "  -> $(basename $f)"
    gosu postgres psql -v ON_ERROR_STOP=1 \
        --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
        -f "$f"
done
echo "==> Migrations done."

# ── Seed admin user (idempotent) ──────────────────────────────────────────────
echo "==> Seeding admin user..."
gosu postgres psql -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -f /docker-entrypoint-initdb.d/seed.sql
echo "==> Seed done."

gosu postgres /usr/lib/postgresql/18/bin/pg_ctl -D /data/postgres -w stop

# ── MinIO data dir ────────────────────────────────────────────────────────────
mkdir -p /data/minio

# ── Supervisor log dir ────────────────────────────────────────────────────────
mkdir -p /var/log/supervisor

# ── Hand off to supervisord ───────────────────────────────────────────────────
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
