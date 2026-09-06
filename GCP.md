# Deploy and Host Postbase on Google Cloud

> **Status: unverified.** This template was written to match Postbase's Docker/Railway/DigitalOcean deploy pattern but has not yet been deployed against a real GCP project. Review `gcp/setup.sh` and `gcp/cloudbuild.yaml` before relying on it in production, and please report issues.

Postbase is a self-hosted auth and database platform for Next.js. Drop it into your stack, configure 25+ auth providers from a dashboard, and connect your app with a single SDK call. Think self-hosted Supabase or Clerk — you own the data, you control the infra.

## About Hosting Postbase

On Google Cloud, Postbase runs as a **Cloud Run** service built from `Dockerfile.railway`, connected to a **Cloud SQL for PostgreSQL 16** instance via the Cloud SQL Auth Proxy (no VPC connector needed — Cloud Run talks to Cloud SQL over a Unix socket). The app is stateless and can be rebuilt/redeployed independently of the database, same split-service model as Railway and DigitalOcean.

Click **Run on Google Cloud** in the [README](README.md) to open Cloud Shell with this repo cloned and [`gcp/tutorial.md`](gcp/tutorial.md) as a walkthrough, then run `./gcp/setup.sh`.

## Common Use Cases

- **Add auth to a Next.js app** — enable email/password, magic links, or any of 25+ OAuth providers (GitHub, Google, Discord, and more) from the dashboard without writing auth code
- **Self-host your user database** — store users, sessions, and OAuth accounts in your own Postgres instance with full SQL access via the built-in editor
- **Manage files and storage** — connect Amazon S3, Cloudflare R2, Backblaze B2, or any S3-compatible bucket per-project from the dashboard

## Dependencies for Postbase Hosting

- A GCP project with billing enabled
- Permission to enable APIs and create Cloud Run services, Cloud SQL instances, Artifact Registry repos, and Secret Manager secrets

### Implementation Details

| Piece | Purpose |
|---|---|
| `gcp/setup.sh` | One-time provisioning: enables APIs, creates the Artifact Registry repo, Cloud SQL instance/database/user, Secret Manager entries, then submits the first build |
| `gcp/cloudbuild.yaml` | Builds `Dockerfile.railway`, pushes to Artifact Registry, deploys to Cloud Run, wires `--add-cloudsql-instances`, then patches in `NEXTAUTH_URL` once the Cloud Run URL is known |
| Cloud SQL instance (`postbase-db`) | Postgres 16, `db-g1-small` tier by default |
| Secret Manager | `postbase-auth-secret`, `postbase-database-url` — mounted into Cloud Run as env vars via `--set-secrets` |

**Environment variables set on the Cloud Run service:**

```
DATABASE_URL         (Secret Manager: postbase-database-url)
NEXTAUTH_SECRET       (Secret Manager: postbase-auth-secret)
POSTBASE_JWT_SECRET   (Secret Manager: postbase-auth-secret)
NEXTAUTH_URL           (set after first deploy, from the Cloud Run service URL)
HOSTNAME               = 0.0.0.0
```

`AUTH_SECRET` is generated automatically by `setup.sh` (`openssl rand -base64 32`) — no manual entry needed.

### Redeploying after a code change

```sh
gcloud builds submit --config=gcp/cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_SERVICE=postbase,_REPO=postbase,_INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe postbase-db --format='value(connectionName)') \
  .
```

There's no push-triggered Cloud Build trigger wired up by default — set one up in Cloud Build → Triggers if you want automatic redeploys on push.

## Why Deploy Postbase on Google Cloud?

Cloud Run's scale-to-zero pricing keeps idle costs low, and pairing it with Cloud SQL keeps Postbase in the same project/IAM boundary as the rest of a GCP-based stack.
