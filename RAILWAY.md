# Deploy and Host Postbase on Railway

Postbase is a self-hosted auth and database platform for Next.js. Drop it into your stack, configure 25+ auth providers from a dashboard, and connect your app with a single SDK call. Think self-hosted Supabase or Clerk — you own the data, you control the infra.

## About Hosting Postbase

On Railway, Postbase runs as two services: `postbase` (a slim Next.js-only app built from `Dockerfile.railway`) and `Postgres` (Railway's managed database with a persistent volume). Splitting stateful and stateless services means git pushes only redeploy the app container — your data is untouched on every deploy. Railway builds `Dockerfile.railway` automatically per `railway.toml`; you link a Postgres service, set a couple of secrets, generate a public domain, and you're live.

## Common Use Cases

- **Add auth to a Next.js app** — enable email/password, magic links, or any of 25+ OAuth providers (GitHub, Google, Discord, and more) from the dashboard without writing auth code
- **Self-host your user database** — store users, sessions, and OAuth accounts in your own Postgres instance with full SQL access via the built-in editor
- **Manage files and storage** — connect Amazon S3, Cloudflare R2, Backblaze B2, or any S3-compatible bucket per-project from the dashboard

## Dependencies for Postbase Hosting

- **Docker** — Railway builds and runs `Dockerfile.railway` automatically per `railway.toml`
- **Railway Postgres service** — a managed Postgres database, linked to the app via a variable reference

### Deployment Dependencies

- [Railway Volumes](https://docs.railway.com/reference/volumes) — used by the Postgres service to persist data; the app service itself is stateless and needs no volume
- [Railway Networking — Generate Domain](https://docs.railway.com/reference/public-networking) — needed to set `NEXTAUTH_URL` to your public URL
- [Postbase README](https://github.com/lonare/postbase.com/blob/main/README.md) — full setup guide including SDK usage and local development

### Implementation Details

Postbase runs two services on Railway:

| Service | Description |
|---|---|
| `postbase` | Next.js dashboard + auth/database API, built from `Dockerfile.railway`, port `3000` (internal; Railway assigns the public port dynamically) |
| `Postgres` | Railway's managed Postgres, linked to `postbase` via `DATABASE_URL` |

On boot, `docker/entrypoint-railway.sh` waits for Postgres to accept connections, applies any pending SQL migrations from `apps/web/drizzle/`, then starts the Next.js server with `HOSTNAME=0.0.0.0` (required — the standalone server binds to localhost by default, which Railway's proxy can't reach). Migration failures are logged but non-fatal, so `/api/health` can report a readable error instead of the deploy looping on a failed healthcheck.

**Variables set via `railway.toml`** (no manual entry needed for these):

```
NEXTAUTH_URL         = https://${{RAILWAY_PUBLIC_DOMAIN}}
NEXTAUTH_SECRET       = ${{AUTH_SECRET}}
POSTBASE_JWT_SECRET   = ${{AUTH_SECRET}}
DATABASE_URL          = ${{Postgres.DATABASE_URL}}
```

**Minimum manual variable** (Railway → `postbase` service → Variables):

```
AUTH_SECRET=changeme
```

> Generate a strong value: `openssl rand -base64 32`

Make sure `DATABASE_URL` is a **variable reference** to the linked Postgres service (`${{Postgres.DATABASE_URL}}`), not a hardcoded connection string.

## Why Deploy Postbase on Railway?

<!-- Recommended: Keep this section as shown below -->
Railway is a singular platform to deploy your infrastructure stack. Railway will host your infrastructure so you don't have to deal with configuration, while allowing you to vertically and horizontally scale it.

By deploying Postbase on Railway, you are one step closer to supporting a complete full-stack application with minimal burden. Host your servers, databases, AI agents, and more on Railway.
<!-- End recommended section -->
