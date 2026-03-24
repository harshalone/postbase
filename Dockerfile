# ─── Stage 1: Build Next.js app ───────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-workspace.yaml* pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter web build


# ─── Stage 2: Runtime — Postgres + MinIO + Next.js in one container ───────────
FROM debian:bookworm-slim AS runner

# ── System deps ──────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg lsb-release supervisor gosu \
    build-essential libssl-dev git \
    && rm -rf /var/lib/apt/lists/*

# ── PostgreSQL 18 ─────────────────────────────────────────────────────────────
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        postgresql-18 postgresql-server-dev-18 \
    && rm -rf /var/lib/apt/lists/*

# ── pg_cron ───────────────────────────────────────────────────────────────────
RUN cd /tmp \
    && git clone --depth 1 --branch v1.6.7 https://github.com/citusdata/pg_cron.git \
    && cd pg_cron && make && make install \
    && rm -rf /tmp/pg_cron

# ── pgmq ──────────────────────────────────────────────────────────────────────
RUN cd /tmp \
    && git clone --depth 1 --branch v1.11.0 https://github.com/pgmq/pgmq.git \
    && cd pgmq/pgmq-extension && make && make install \
    && rm -rf /tmp/pgmq

# ── Node 22 ───────────────────────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── MinIO ─────────────────────────────────────────────────────────────────────
RUN curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o /usr/local/bin/minio \
    && chmod +x /usr/local/bin/minio

# ── Next.js app ───────────────────────────────────────────────────────────────
WORKDIR /app
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# ── Init SQL ──────────────────────────────────────────────────────────────────
COPY scripts/init.sql /docker-entrypoint-initdb.d/init.sql

# ── supervisord config ────────────────────────────────────────────────────────
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# ── Entrypoint ────────────────────────────────────────────────────────────────
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Data volume — Postgres and MinIO both persist here
VOLUME ["/data"]

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
