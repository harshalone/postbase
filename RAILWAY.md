# Deploy and Host Postbase on Railway

Postbase is a self-hosted auth and database platform for Next.js. Drop it into your stack, configure 25+ auth providers from a dashboard, and connect your app with a single SDK call. Think self-hosted Supabase or Clerk — you own the data, you control the infra.

## About Hosting Postbase

Postbase ships as a single Docker container bundling PostgreSQL 18 (with pg_cron and pgmq), MinIO object storage, and the Next.js dashboard — all managed by supervisord. Deploying on Railway means one service, one attached volume, and a handful of environment variables. Railway detects the root Dockerfile automatically. You attach a volume at `/data` to persist your database and object storage, set a few secrets, generate a public domain, and you're live. No separate database service or storage bucket required — everything runs together out of the box.

## Common Use Cases

- **Add auth to a Next.js app** — enable email/password, magic links, or any of 25+ OAuth providers (GitHub, Google, Discord, and more) from the dashboard without writing auth code
- **Self-host your user database** — store users, sessions, and OAuth accounts in your own Postgres instance with full SQL access via the built-in editor
- **Manage files and storage** — use the bundled MinIO instance or connect Amazon S3, Cloudflare R2, or Backblaze B2 for per-project object storage

## Dependencies for Postbase Hosting

- **Docker** — Postbase is packaged as a single image; Railway builds and runs it automatically from the repo's root `Dockerfile`
- **Persistent volume** — attach a Railway volume at `/data` before first deploy to persist PostgreSQL data and MinIO object storage across redeploys

### Deployment Dependencies

- [Railway Volumes](https://docs.railway.com/reference/volumes) — required to persist `/data/postgres` and `/data/minio`
- [Railway Networking — Generate Domain](https://docs.railway.com/reference/public-networking) — needed to set `NEXTAUTH_URL` to your public URL
- [Postbase README](https://github.com/lonare/postbase.com/blob/main/README.md) — full setup guide including SDK usage and local development

### Implementation Details

Postbase runs three processes inside one container via supervisord:

| Process | Port | Description |
|---|---|---|
| PostgreSQL 18 | 5432 (internal) | Custom build with pg_cron + pgmq |
| MinIO | 9000 (internal) | S3-compatible object storage |
| Next.js app | 3000 (public) | Dashboard + auth API |

Only port `3000` is exposed. Postgres and MinIO are internal only.

**Minimum required environment variables** (paste into Railway → Variables → RAW Editor):

```
POSTGRES_USER=postbase
POSTGRES_PASSWORD=changeme
POSTGRES_DB=postbase
MINIO_ROOT_USER=postbase
MINIO_ROOT_PASSWORD=changeme
AUTH_SECRET=changeme
```

> Generate strong values: `openssl rand -base64 32`

The following are derived automatically and do not need to be set manually:

```
NEXTAUTH_SECRET=${{AUTH_SECRET}}
POSTBASE_JWT_SECRET=${{AUTH_SECRET}}
DATABASE_URL=postgresql://${{POSTGRES_USER}}:${{POSTGRES_PASSWORD}}@localhost:5432/${{POSTGRES_DB}}
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=${{MINIO_ROOT_USER}}
MINIO_SECRET_KEY=${{MINIO_ROOT_PASSWORD}}
```

## Why Deploy Postbase on Railway?

<!-- Recommended: Keep this section as shown below -->
Railway is a singular platform to deploy your infrastructure stack. Railway will host your infrastructure so you don't have to deal with configuration, while allowing you to vertically and horizontally scale it.

By deploying Postbase on Railway, you are one step closer to supporting a complete full-stack application with minimal burden. Host your servers, databases, AI agents, and more on Railway.
<!-- End recommended section -->
