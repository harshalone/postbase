# Deploying Postbase on Railway

Postbase ships as a **single Docker container** bundling PostgreSQL 18, MinIO, and the Next.js app — managed by supervisord. One Railway service, one volume.

## Quick Deploy

1. Fork or push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Select your repo — Railway detects the root `Dockerfile` automatically
4. Add a **Volume** → mount path: `/data`
5. Set the environment variables below
6. Go to **Settings → Networking → Generate Domain** to get your public URL
7. Set `NEXTAUTH_URL` to that domain (e.g. `https://your-app.up.railway.app`)
8. Redeploy

---

## Environment Variables

### Required

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (localhost since bundled) | `postgresql://postbase:yourpassword@localhost:5432/postbase` |
| `AUTH_SECRET` | NextAuth secret — generate with `openssl rand -base64 32` | `abc123...` |
| `NEXTAUTH_URL` | Your public Railway domain | `https://your-app.up.railway.app` |
| `POSTGRES_PASSWORD` | Password for the PostgreSQL user | `yourpassword` |
| `MINIO_ROOT_PASSWORD` | Password for MinIO root user | `yourminipassword` |

### Storage (bundled MinIO defaults — no changes needed unless using external S3)

| Variable | Default | Description |
|---|---|---|
| `MINIO_ENDPOINT` | `http://localhost:9000` | MinIO API endpoint |
| `MINIO_ACCESS_KEY` | `postbase` | MinIO root user |
| `MINIO_SECRET_KEY` | same as `MINIO_ROOT_PASSWORD` | MinIO root password |

### Optional / Postgres internals

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_USER` | `postbase` | PostgreSQL username |
| `POSTGRES_DB` | `postbase` | PostgreSQL database name |
| `MINIO_ROOT_USER` | `postbase` | MinIO root username |
| `NEXTAUTH_SECRET` | falls back to `AUTH_SECRET` | Alias — set same value as `AUTH_SECRET` |
| `POSTBASE_JWT_SECRET` | falls back to `NEXTAUTH_SECRET` | JWT signing secret for Postbase auth tokens |

---

## Using External Storage (Optional)

By default Postbase uses the bundled MinIO instance. Per-project you can configure AWS S3, Cloudflare R2, or any S3-compatible provider from the dashboard — those credentials override the bundled MinIO for that project.

To replace MinIO entirely, point these vars at your external provider:

```
MINIO_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # R2 example
MINIO_ACCESS_KEY=<access-key-id>
MINIO_SECRET_KEY=<secret-access-key>
```

---

## What Runs Inside the Container

| Process | Port | Description |
|---|---|---|
| PostgreSQL 18 | 5432 (internal) | Custom build with pg_cron + pgmq |
| MinIO | 9000 (internal) | S3-compatible object storage |
| Next.js app | 3000 (public) | The Postbase dashboard + API |

Only port `3000` is exposed publicly. Postgres and MinIO are internal only.

## Data Persistence

All data is stored under the `/data` volume:

- `/data/postgres` — PostgreSQL data directory
- `/data/minio` — MinIO object storage

**Make sure the Railway volume is attached before first deploy**, otherwise data will be lost on every redeploy.

---

## Local Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) or run:

```bash
./dev.sh
```

---

## Railway Environment Variables (copy-paste)

Paste this into Railway → Service → Variables → **RAW Editor**.

Only fill in the 3 values marked — everything else is auto-derived by `railway.toml`.

```
POSTGRES_USER=postbase
POSTGRES_PASSWORD=changeme
POSTGRES_DB=postbase
MINIO_ROOT_USER=postbase
MINIO_ROOT_PASSWORD=changeme
AUTH_SECRET=changeme
```

> Generate strong values:
> - Passwords: `openssl rand -base64 24`
> - Auth secret: `openssl rand -base64 32`

These are automatically derived and do **not** need to be set manually:

| Variable | Auto value |
|---|---|
| `DATABASE_URL` | built from `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| `NEXTAUTH_URL` | `https://<your-app>.up.railway.app` via `RAILWAY_PUBLIC_DOMAIN` |
| `NEXTAUTH_SECRET` | same as `AUTH_SECRET` |
| `POSTBASE_JWT_SECRET` | same as `AUTH_SECRET` |
| `MINIO_ENDPOINT` | `http://localhost:9000` |
| `MINIO_ACCESS_KEY` | same as `MINIO_ROOT_USER` |
| `MINIO_SECRET_KEY` | same as `MINIO_ROOT_PASSWORD` |

---

## OAuth Provider Callback URLs

When configuring an OAuth provider (Google, GitHub, etc.) in their developer console, use this as the **Authorized Redirect URI / Callback URL**:

```
https://<your-app>.up.railway.app/api/auth/<YOUR_PROJECT_ID>/callback/<provider>
```

Examples (replace `<your-app>` and `<YOUR_PROJECT_ID>`):

| Provider | Callback URL |
|---|---|
| Google | `https://<your-app>.up.railway.app/api/auth/<project-id>/callback/google` |
| GitHub | `https://<your-app>.up.railway.app/api/auth/<project-id>/callback/github` |
| Discord | `https://<your-app>.up.railway.app/api/auth/<project-id>/callback/discord` |
| Facebook | `https://<your-app>.up.railway.app/api/auth/<project-id>/callback/facebook` |
| Twitter/X | `https://<your-app>.up.railway.app/api/auth/<project-id>/callback/twitter` |
| LinkedIn | `https://<your-app>.up.railway.app/api/auth/<project-id>/callback/linkedin` |
| Apple | `https://<your-app>.up.railway.app/api/auth/<project-id>/callback/apple` |
| Microsoft | `https://<your-app>.up.railway.app/api/auth/<project-id>/callback/microsoft-entra-id` |
| Slack | `https://<your-app>.up.railway.app/api/auth/<project-id>/callback/slack` |
| Twitch | `https://<your-app>.up.railway.app/api/auth/<project-id>/callback/twitch` |
| Spotify | `https://<your-app>.up.railway.app/api/auth/<project-id>/callback/spotify` |
| Notion | `https://<your-app>.up.railway.app/api/auth/<project-id>/callback/notion` |
| GitLab | `https://<your-app>.up.railway.app/api/auth/<project-id>/callback/gitlab` |

> Your `project-id` is visible in the Postbase dashboard URL once you create a project.
