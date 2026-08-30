# Deploy and Host Postbase on DigitalOcean

Postbase is a self-hosted auth and database platform for Next.js. Drop it into your stack, configure 25+ auth providers from a dashboard, and connect your app with a single SDK call. Think self-hosted Supabase or Clerk — you own the data, you control the infra.

## About Hosting Postbase

On DigitalOcean, Postbase runs as an [App Platform](https://docs.digitalocean.com/products/app-platform/) service built from `Dockerfile.railway` — a slim, Next.js-only image with no bundled Postgres. The app connects to a separate **Managed Postgres** database (provisioned automatically by the app spec), so the stateless app service can be redeployed on every push without ever touching your data.

Click **Deploy to DigitalOcean** in the [README](README.md), review the pre-filled app spec, add an `AUTH_SECRET`, and deploy.

## Common Use Cases

- **Add auth to a Next.js app** — enable email/password, magic links, or any of 25+ OAuth providers (GitHub, Google, Discord, and more) from the dashboard without writing auth code
- **Self-host your user database** — store users, sessions, and OAuth accounts in your own Postgres instance with full SQL access via the built-in editor
- **Manage files and storage** — connect Amazon S3, Cloudflare R2, Backblaze B2, or any S3-compatible bucket per-project from the dashboard

## Dependencies for Postbase Hosting

- **Docker** — App Platform builds and runs the image automatically from `Dockerfile.railway` at the repo root
- **Managed Database (Postgres 16)** — provisioned by `.do/deploy.template.yaml`; the app's `DATABASE_URL` is bound to it automatically

### Deployment Dependencies

- [App Platform App Spec reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/) — the schema behind `.do/deploy.template.yaml`
- [App Platform Managed Databases](https://docs.digitalocean.com/products/app-platform/how-to/manage-databases/) — how the bound `postbase-db` component works
- [Postbase README](https://github.com/harshalone/postbase/blob/main/README.md) — full setup guide including SDK usage and local development

### Implementation Details

The app spec (`.do/deploy.template.yaml`) defines two components:

| Component | Type | Description |
|---|---|---|
| `postbase` | Service (Dockerfile) | Next.js dashboard + auth/database API, built from `Dockerfile.railway` |
| `postbase-db` | Managed Database (PG 16) | Stores the `_postbase` schema — users, sessions, projects, cron jobs |

The container listens on port `3000`. App Platform terminates TLS and proxies your public URL to it. Health checks poll `/api/health`.

On boot, `docker/entrypoint-railway.sh` waits for Postgres to accept connections, applies any pending SQL migrations from `apps/web/drizzle/`, then starts the Next.js server. Migration failures are logged but non-fatal — the server still starts so `/api/health` can report a readable error instead of the deploy hanging.

**Environment variables set by the app spec:**

```
DATABASE_URL       = ${postbase-db.DATABASE_URL}   # bound automatically
NEXTAUTH_URL        = ${APP_URL}                    # your App Platform public URL
NEXTAUTH_SECRET      = ${AUTH_SECRET}
POSTBASE_JWT_SECRET  = ${AUTH_SECRET}
```

`AUTH_SECRET` has no default value, so the App Platform create-app flow will prompt you to fill it in before deploying. Generate a strong value with `openssl rand -base64 32`.

## Why Deploy Postbase on DigitalOcean?

App Platform gives you a fully managed build-and-deploy pipeline plus a managed Postgres database, without running your own infrastructure. Push to `main` and App Platform rebuilds and redeploys the `postbase` service while your database stays untouched — the same split-service model used in production Postbase deployments.
