<p align="center">
  <img src="apps/web/public/logo.png" alt="Postbase" width="80" />
</p>

# Postbase

Self-hosted auth + database platform for Next.js. Drop it in, configure your providers from a dashboard, and connect your app with a single SDK call.

Think: self-hosted Supabase / Clerk — you own the data, you control the infra.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/postbase?referralCode=lonare&utm_medium=integration&utm_source=template&utm_campaign=generic)

---

## Screenshots

<p align="center">
  <img src="images/1.png" alt="Postbase landing" width="100%" />
  <br/><em>Self-hosted auth + database platform for Next.js</em>
</p>

<p align="center">
  <img src="images/2.png" alt="Dashboard" width="100%" />
  <br/><em>Dashboard — manage organisations and projects</em>
</p>

<p align="center">
  <img src="images/3.png" alt="Project overview" width="100%" />
  <br/><em>Project overview with quick-start guide</em>
</p>

<p align="center">
  <img src="images/4.png" alt="Auth providers" width="100%" />
  <br/><em>25+ auth providers — toggle any from the dashboard</em>
</p>

<p align="center">
  <img src="images/5.png" alt="SQL editor" width="100%" />
  <br/><em>Built-in SQL editor with AI query generation</em>
</p>

<p align="center">
  <img src="images/6.png" alt="Storage connections" width="100%" />
  <br/><em>S3-compatible storage — connect Amazon S3, Cloudflare R2, Backblaze B2, and more</em>
</p>

<p align="center">
  <img src="images/7.png" alt="Cron jobs" width="100%" />
  <br/><em>Scheduled cron jobs — run SQL snippets or HTTP requests on any schedule</em>
</p>

<p align="center">
  <img src="images/8.png" alt="API keys" width="100%" />
  <br/><em>API keys — anon and service role keys with SDK snippet</em>
</p>

<p align="center">
  <img src="images/9.png" alt="Project settings" width="100%" />
  <br/><em>Project settings — configure auth redirect URLs, JWT expiry, and more</em>
</p>

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
git clone https://github.com/harshalone/postbase
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

./dev.sh --rebuild  

./dev.sh --reset

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

## Connect your app

### Install the SDK

```bash
npm install postbasejs
# or
pnpm add postbasejs
```

### Initialize the client

```ts
// lib/postbase.ts
import { createClient } from 'postbasejs'

export const postbase = createClient(
  'http://localhost:3000',       // your Postbase instance URL
  'pb_anon_...',                 // your anon key (safe for browser)
  { projectId: 'your-project-id' }
)
```

For server-side / admin operations use your `service_role` key — keep it out of the browser.

---

## Usage

### Auth — email + password

```ts
await postbase.auth.signUp({ email: 'user@example.com', password: 'secret' })

const { data, error } = await postbase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secret',
})

await postbase.auth.signOut()

const { data: { session } } = await postbase.auth.getSession()

postbase.auth.onAuthStateChange((event, session) => {
  console.log(event, session?.user)
})
```

### Auth — OAuth (browser / web)

```ts
// Redirects browser to the provider, then back to your redirectTo URL
await postbase.auth.signInWithOAuth({
  provider: 'google', // 'github', 'discord', 'apple', etc.
  options: { redirectTo: 'https://yourapp.com/callback' },
})

// On your callback page — parses tokens from the URL automatically
const { data, error } = await postbase.auth.handleOAuthCallback()
```

### Auth — OAuth (native iOS / Android — custom URL scheme)

Use an in-app browser (`ASWebAuthenticationSession` on iOS, Chrome Custom Tab on Android) with a custom URL scheme as the redirect target:

```ts
// Returns the authorize URL for you to open in an in-app browser
const authorizeUrl = await postbase.auth.signInWithOAuth({
  provider: 'github',
  options: { redirectTo: 'com.myapp://auth/callback' },
})
// → open authorizeUrl in ASWebAuthenticationSession / Chrome Custom Tab

// After the in-app browser hands the URL back to your app:
const { data, error } = await postbase.auth.handleOAuthCallback({
  url: incomingUrl, // e.g. 'com.myapp://auth/callback?access_token=...'
})
```

### Auth — Apple / Google native SDK (no browser at all)

For apps that use `ASAuthorizationController` (Apple) or `GIDSignIn` (Google), pass the `id_token` directly — no browser, no redirect:

```ts
// Apple (Swift → bridge identityToken string to JS)
const { data, error } = await postbase.auth.signInWithIdToken({
  provider: 'apple',
  idToken: appleIdentityToken,
  nonce: nonce, // optional, if you passed one to ASAuthorizationAppleIDRequest
})

// Google (Android / iOS)
const { data, error } = await postbase.auth.signInWithIdToken({
  provider: 'google',
  idToken: googleIdToken,
})
// data.session.accessToken, data.session.refreshToken, data.user
```

### Database

```ts
// SELECT
const { data, error } = await postbase
  .from('posts')
  .select('id, title, created_at')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(10)

// INSERT
const { data } = await postbase
  .from('posts')
  .insert({ title: 'Hello world', user_id: userId })
  .select()
  .single()

// UPDATE
await postbase.from('posts').update({ title: 'Updated' }).eq('id', postId)

// DELETE
await postbase.from('posts').delete().eq('id', postId)
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
const { data: { publicUrl } } = postbase.storage.from('avatars').getPublicUrl('user-123/avatar.png')

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

**Apple and Google** additionally support a **native id_token flow** — iOS/macOS/Android apps can sign users in via the OS native SDK (no browser required) using `signInWithIdToken()` in the JS SDK.

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
- [Docker](https://docker.com) — containerized deployment

---

## Claude Code Skill

A Claude Code skill is bundled at [`skills/postbase/SKILL.md`](skills/postbase/SKILL.md).

It covers the full Postbase API reference, postbasejs SDK patterns, RLS, auth tables, cron jobs, storage, and Swift integration — loaded automatically when you use `/postbase` in Claude Code, or activated whenever Claude detects you're building against a Postbase backend.

To install it in your own project:

```bash
cp skills/postbase/SKILL.md <your-project>/.claude/skills/postbase/SKILL.md
```

---

## License

MIT
