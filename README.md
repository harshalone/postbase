<p align="center">
  <img src="apps/web/public/logo.png" alt="Postbase" width="80" />
</p>

# Postbase

Self-hosted auth + database platform for Next.js. Drop it in, configure your providers from a dashboard, and connect your app with a single SDK call.

Think: self-hosted Supabase / Clerk — you own the data, you control the infra.

---

## Features

- **25+ Auth Providers** — Google, GitHub, Discord, Magic Link, Passkeys, SMS OTP, SAML/SSO, and more — all toggleable from the dashboard
- **Database API** — Query your PostgreSQL via `anon key` (respects RLS) or `service_role key` (full access)
- **File Storage** — S3-compatible object storage with bucket policies
- **Multi-project** — One Postbase instance can serve multiple apps
- **Self-hosted** — Single `docker compose up` and you're running

---

## Quick Start

### 1. Clone & configure

```bash
git clone https://github.com/your-org/postbase
cd postbase
cp .env.example .env
```

Open `.env` and set your secret:

```bash
# Generate a secure secret
openssl rand -base64 32
```

### 1 Run the dev sh
```
./dev.sh

./dev.sh --rebuild // is your go-to when you change the Dockerfile

```

Paste the output as `NEXTAUTH_SECRET` in your `.env`.

### 2. Start the services

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on port `5432`
- **MinIO** (storage) on port `9000` (console on `9001`)
- **Postbase app** on port `3000`

### 3. Run database migrations

```bash
cd apps/web
pnpm install
pnpm db:push
```

### 4. Open the dashboard

Visit [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

1. Create a project → get your `anon key` and `service_role key`
2. Go to **Auth Providers** → enable the providers you want, paste in OAuth credentials
3. Copy your keys from the **API Keys** tab

---

## Local Development

For development you don't need to rebuild Docker on every change. Run only the infrastructure (PostgreSQL + MinIO) in Docker and the Next.js app locally with hot reload.

### 1. Start infrastructure only

```bash
pnpm infra:up
```

This starts PostgreSQL and MinIO in Docker — without the app container.

### 2. Run the app locally

```bash
pnpm db:push   # first time only — run migrations
pnpm dev       # Next.js dev server with hot reload
```

That's it. Edit code → changes reflect instantly, no Docker rebuild needed.

### Useful dev commands

| Command | Description |
|---------|-------------|
| `pnpm infra:up` | Start postgres + minio |
| `pnpm infra:down` | Stop postgres + minio (data is preserved) |
| `pnpm infra:logs` | Tail infrastructure logs |
| `pnpm dev` | Start Next.js dev server |
| `pnpm db:push` | Push schema changes to the database |
| `pnpm db:studio` | Open Drizzle Studio (visual DB browser) |

### Production deployment

When deploying, use the full Docker Compose stack which includes the app container:

```bash
docker compose up -d
```

---

## Connect your Next.js app

### Install the SDK

```bash
npm install @postbase/client
# or
pnpm add @postbase/client
```

### Initialize the client

```ts
// lib/postbase.ts
import { createClient } from '@postbase/client'

export const postbase = createClient(
  'http://localhost:3000',  // your Postbase instance URL
  'pb_anon_...'             // your anon key (safe for browser)
)
```

For server-side / admin operations use your `service_role` key — keep it out of the browser.

---

## Usage

### Auth

```ts
// Sign in with any enabled provider
await postbase.auth.signIn('google')
await postbase.auth.signIn('github')

// Email + password
await postbase.auth.signUp('user@example.com', 'password')
await postbase.auth.signIn('credentials', { email, password })

// Get the current session
const session = await postbase.auth.getSession()

// Sign out
await postbase.auth.signOut()

// Listen to auth state changes
const unsubscribe = postbase.auth.onAuthStateChange((session) => {
  console.log(session?.user)
})
```

### Database

```ts
// SELECT
const { data, error } = await postbase
  .from('posts')
  .select('id', 'title', 'created_at')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(10)

// INSERT
const { data } = await postbase
  .from('posts')
  .insert({ title: 'Hello world', user_id: userId })
  .returning()

// UPDATE
await postbase
  .from('posts')
  .update({ title: 'Updated' })
  .eq('id', postId)

// DELETE
await postbase
  .from('posts')
  .delete()
  .eq('id', postId)
```

> **anon key** — enforces Row Level Security policies on your tables.
> **service_role key** — bypasses RLS. Server-side only.

### Storage

```ts
// Upload a file
const { data, error } = await postbase
  .storage
  .from('avatars')
  .upload('user-123/avatar.png', file)

// Get a public URL
const url = postbase.storage.from('avatars').getPublicUrl('user-123/avatar.png')

// Download
const { data: blob } = await postbase.storage.from('avatars').download('user-123/avatar.png')

// List files
const { data: files } = await postbase.storage.from('avatars').list('user-123/')

// Delete
await postbase.storage.from('avatars').remove(['user-123/avatar.png'])
```

---

## Auth Providers

Enable any of these from the dashboard — no code changes needed.

| Category | Providers |
|----------|-----------|
| Social | Google, GitHub, Discord, Twitter/X, Facebook, LinkedIn, Apple, Microsoft, Slack, Twitch, Spotify, Notion, GitLab, Bitbucket, Dropbox, Box |
| Credentials | Email + Password, Magic Link, Phone/SMS OTP |
| Passwordless | Passkeys (WebAuthn), Anonymous/Guest |
| Enterprise | SAML/SSO, Okta, Keycloak, Auth0 |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postbase:postbase@localhost:5432/postbase` |
| `NEXTAUTH_SECRET` | Secret for signing tokens — **required** | — |
| `NEXTAUTH_URL` | Public URL of your Postbase instance | `http://localhost:3000` |
| `MINIO_ROOT_USER` | MinIO access key | `postbase` |
| `MINIO_ROOT_PASSWORD` | MinIO secret key | `postbase_secret` |

---

## Stack

- [Next.js 15](https://nextjs.org) — dashboard + API
- [Auth.js v5](https://authjs.dev) — auth provider handling
- [Drizzle ORM](https://orm.drizzle.team) — database schema & queries
- [PostgreSQL 16](https://postgresql.org) — primary database
- [MinIO](https://min.io) — S3-compatible object storage
- [Docker](https://docker.com) — containerized deployment

---

## License

MIT
