#!/bin/bash
set -e

# ── Defaults ──────────────────────────────────────────────────────────────────
POSTGRES_USER="${POSTGRES_USER:-postbase}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postbase}"
POSTGRES_DB="${POSTGRES_DB:-postbase}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-postbase}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-postbase_secret}"

export MINIO_ROOT_USER MINIO_ROOT_PASSWORD

# ── Postgres data dir ─────────────────────────────────────────────────────────
if [ ! -d /data/postgres ]; then
    echo "==> Initialising PostgreSQL data directory..."
    mkdir -p /data/postgres
    chown -R postgres:postgres /data/postgres
    gosu postgres /usr/lib/postgresql/18/bin/initdb \
        -D /data/postgres \
        --username="$POSTGRES_USER" \
        --auth-local=trust \
        --auth-host=md5

    # pg_cron requires shared_preload_libraries
    echo "shared_preload_libraries = 'pg_cron'" >> /data/postgres/postgresql.conf
    echo "cron.database_name = '$POSTGRES_DB'"  >> /data/postgres/postgresql.conf

    # Allow connections from localhost only
    echo "host all all 127.0.0.1/32 md5" >> /data/postgres/pg_hba.conf

    # Start Postgres temporarily to create DB and run init SQL
    gosu postgres /usr/lib/postgresql/18/bin/pg_ctl \
        -D /data/postgres -w start

    gosu postgres psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        ALTER USER "$POSTGRES_USER" WITH PASSWORD '$POSTGRES_PASSWORD';
        CREATE DATABASE "$POSTGRES_DB" OWNER "$POSTGRES_USER";
EOSQL

    gosu postgres psql -v ON_ERROR_STOP=1 \
        --username "$POSTGRES_USER" \
        --dbname "$POSTGRES_DB" \
        -f /docker-entrypoint-initdb.d/init.sql

    gosu postgres /usr/lib/postgresql/18/bin/pg_ctl \
        -D /data/postgres -w stop

    echo "==> PostgreSQL initialised."
fi

# ── MinIO data dir ────────────────────────────────────────────────────────────
mkdir -p /data/minio

# ── Supervisor log dir ────────────────────────────────────────────────────────
mkdir -p /var/log/supervisor

# ── Hand off to supervisord ───────────────────────────────────────────────────
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
