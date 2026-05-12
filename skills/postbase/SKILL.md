---
name: postbase
description: Postbase API reference and postbasejs SDK patterns. Use when building against a Postbase backend — covers REST API endpoints, auth, database queries, storage, RPC, RLS, the postbasejs JavaScript/TypeScript client, and the _system auth table schema.
origin: user
---

# Postbase Reference

Postbase is a self-hosted, open-source backend-as-a-service built on PostgreSQL. It provides a REST query API, authentication (password, magic link, OTP, OAuth), file storage, and row-level security.

- Site: https://getpostbase.com
- REST base: `https://<your-instance>/`
- Auth header: `Authorization: Bearer <api_key>`
- User JWT header: `X-Postbase-Token: <access_token>` (enables RLS)

## When to Activate

- Writing any code that calls a Postbase REST API
- Using the `postbasejs` / `postbasejs/ssr` SDK
- Designing RLS policies for Postbase tables
- Troubleshooting 400/401 errors from Postbase endpoints
- Setting up auth flows (OTP, magic link, OAuth, password)
- Working with Postbase storage buckets

---

## REST API Reference

### Auth — `/api/auth/v1/{projectId}/...`

All auth endpoints require `Authorization: Bearer <anon_key>` unless noted.

#### Send Email OTP
```
POST /api/auth/v1/{projectId}/email-otp
Body: { "email": "user@example.com" }
200: OTP sent | 400: invalid email | 500: email provider not configured
```

#### Verify Email OTP → session
```
POST /api/auth/v1/{projectId}/email-otp/verify
Body: { "email": "user@example.com", "code": "123456" }
200: { access_token, refresh_token, expires_in, user }
400: expired/invalid | 404: user not found
```

#### Send Magic Link or OTP
```
POST /api/auth/v1/{projectId}/otp
Body: { "email": "user@example.com", "type": "magic_link" | "otp", "redirectTo": "..." }
200: sent | 403: provider not enabled | 500: email not configured
```

#### Verify Magic Link (API)
```
POST /api/auth/v1/{projectId}/verify
Body: { "email": "user@example.com", "token": "<magic_token>" }
200: { access_token, refresh_token, user }
```

#### Sign Up (email + password)
```
POST /api/auth/v1/{projectId}/signup
Body: { "email": "user@example.com", "password": "...", "data": {} }
200: { access_token, refresh_token, user } | 422: already registered
```

#### Sign In / Refresh Token
```
POST /api/auth/v1/{projectId}/token
Body (password):      { "grant_type": "password", "email": "...", "password": "..." }
Body (refresh):       { "grant_type": "refresh_token", "refresh_token": "..." }
200: { access_token, refresh_token, expires_in, user }
400: invalid creds | 403: banned
```

#### Get Session
```
GET /api/auth/v1/{projectId}/session
Headers: X-Postbase-Token: <access_token>
         X-Postbase-Session: <refresh_token>   (optional, refreshes if expired)
200: session object or null
```

#### Logout
```
POST /api/auth/v1/{projectId}/logout
Headers: X-Postbase-Token: <access_token>
200: logged out
```

#### Get Authenticated User
```
GET /api/auth/v1/{projectId}/user
Headers: X-Postbase-Token: <access_token>   (required)
200: { id, email, name, image, data }
```

#### Update Authenticated User
```
PATCH /api/auth/v1/{projectId}/user
Headers: X-Postbase-Token: <access_token>   (required)
Body: { "name": "Alice", "image": "url", "data": {} }
200: updated user
```

---

### Database — `/api/db/query`

Single endpoint for all DB operations. Honors RLS when `X-Postbase-Token` is provided.

```
POST /api/db/query
Authorization: Bearer <api_key>
X-Postbase-Token: <user_jwt>   (optional — enables RLS)

Body:
{
  "operation": "select" | "insert" | "update" | "upsert" | "delete",
  "table": "table_name",
  "columns": ["col1", "col2"],        // omit for all columns — do NOT use "*"
  "filters": [
    { "column": "id", "operator": "eq", "value": "abc" }
  ],
  "data": { "col": "val" },           // insert / update / upsert payload
  "limit": 10,
  "offset": 0
}
```

**Filter operators:** `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `is`, `contains`, `overlaps`

**Important:** Do NOT pass `"columns": ["*"]` — Postbase rejects the wildcard. Omit `columns` entirely to return all columns.

**Response:** `{ "data": [...], "count": N }` or a direct array `[...]`

---

### RPC — `/api/rpc/{fn}`

Call a PostgreSQL function in the project's schema.

```
POST /api/rpc/{function_name}
Authorization: Bearer <api_key>
X-Postbase-Token: <user_jwt>   (optional)

Body: { "args": { "param1": "val1" }, "count": "exact" }
200: function result
```

---

### Email — `/api/email/v1/{projectId}/send`

```
POST /api/email/v1/{projectId}/send
Authorization: Bearer <api_key>

Body: { "to": "user@example.com", "subject": "...", "text": "...", "html": "..." }
200: sent | 500: provider not configured
```

---

### Storage — `/api/storage/v1/...`

#### Buckets
```
GET    /api/storage/v1/bucket          → list all buckets
POST   /api/storage/v1/bucket          → create bucket
         Body: { "id": "...", "name": "...", "public": true, "file_size_limit": 0, "allowed_mime_types": [] }
GET    /api/storage/v1/bucket/{id}     → get bucket details
PUT    /api/storage/v1/bucket/{id}     → update bucket
         Body: { "public": true, "file_size_limit": 0, "allowed_mime_types": [] }
DELETE /api/storage/v1/bucket/{id}     → delete bucket (must be empty first, 409 if not)
```

#### Objects
```
POST /api/storage/v1/object/{bucket}/{path}    → upload (multipart/form-data, field: "file")
     Header: X-Postbase-Token: <token>         (for private buckets)
PUT  /api/storage/v1/object/{bucket}/{path}    → upsert (multipart/form-data)
GET  /api/storage/v1/object/{bucket}/{path}    → download (authenticated)
GET  /api/storage/v1/object/public/{bucket}/{path} → download public object (no auth)
DELETE /api/storage/v1/object/{bucket}
     Body: { "prefixes": ["path/file.png", "path/other.png"] }
```

---

## postbasejs SDK

```
npm install postbasejs
```

### Client Setup

```ts
import { createClient } from 'postbasejs'

const postbase = createClient(
  'https://your-postbase-instance.com',
  'pb_anon_your_api_key',
  { projectId: 'your-project-id' }
)
```

### Database

```ts
// Select — omit column arg for all columns
const { data, error } = await postbase.from('posts').select()
const { data } = await postbase.from('posts').select('id, title')

// Filters + ordering
const { data } = await postbase
  .from('posts')
  .select()
  .eq('status', 'published')
  .order('created_at', { ascending: false })
  .limit(10)

// Count
const { data, count } = await postbase.from('posts').select('*', { count: 'exact' })

// Single row (errors if not exactly one)
const { data } = await postbase.from('posts').select().eq('id', id).single()

// Maybe single (null if not found, no error)
const { data } = await postbase.from('posts').select().eq('id', id).maybeSingle()

// Pagination
const { data } = await postbase.from('posts').select().limit(20).offset(40)
const { data } = await postbase.from('posts').select().range(0, 19)
```

**Filter methods:** `.eq` `.neq` `.gt` `.gte` `.lt` `.lte` `.like` `.ilike` `.in` `.is` `.contains` `.overlaps` `.textSearch` `.or` `.not`

```ts
// Insert
const { data, error } = await postbase.from('posts').insert({ title: 'Hello' }).select().single()

// Update
const { data } = await postbase.from('posts').update({ status: 'published' }).eq('id', id).select().single()

// Upsert
const { data } = await postbase.from('profiles').upsert({ id: 'user-id', username: 'alice' }, { onConflict: 'id' }).select()

// Delete
const { error } = await postbase.from('posts').delete().eq('id', id)
```

### TypeScript generics

```ts
interface Post { id: string; title: string; status: 'draft' | 'published'; created_at: string }
const { data } = await postbase.from<Post>('posts').select().eq('status', 'published')
// data is Post[] | null
```

### Auth

```ts
// Password
await postbase.auth.signUp({ email, password })
await postbase.auth.signInWithPassword({ email, password })

// Magic link
await postbase.auth.signInWithOtp({ email, type: 'magic_link', options: { redirectTo: '...' } })

// 6-digit OTP
await postbase.auth.signInWithOtp({ email, type: 'otp' })
const { data } = await postbase.auth.verifyOtp({ email, token: '123456' })

// OAuth (browser redirect)
await postbase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '...' } })

// Session + user
const { data: { user } }    = await postbase.auth.getUser()
const { data: { session } } = await postbase.auth.getSession()
// session.accessToken, session.user, session.expiresAt

// Update profile
await postbase.auth.updateUser({ name: 'Alice', metadata: { plan: 'pro' } })

// Sign out
await postbase.auth.signOut()

// Listen to auth changes
const { data: { subscription } } = postbase.auth.onAuthStateChange((event, session) => {
  // event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED'
})
subscription.unsubscribe()
```

### Admin (service key only — bypasses RLS)

```ts
const admin = createClient(url, 'pb_service_...', { projectId })
await admin.auth.admin.listUsers({ page: 1, perPage: 50 })
await admin.auth.admin.createUser({ email, password, email_confirm: true })
await admin.auth.admin.updateUserById(userId, { email: 'new@example.com' })
await admin.auth.admin.deleteUser(userId)
```

### Storage

```ts
// Upload
const { data } = await postbase.storage.from('avatars').upload('user-123.png', file, { contentType: 'image/png' })

// Public URL
const { data: { publicUrl } } = postbase.storage.from('avatars').getPublicUrl('user-123.png')

// Download
const { data: blob } = await postbase.storage.from('avatars').download('user-123.png')

// Signed URL (temporary)
const { data } = await postbase.storage.from('private-docs').createSignedUrl('report.pdf', 3600)

// List
const { data } = await postbase.storage.from('avatars').list('folder/', { limit: 100 })

// Delete
await postbase.storage.from('avatars').remove(['user-123.png', 'user-456.png'])

// Move / Copy
await postbase.storage.from('docs').move('old.pdf', 'new.pdf')
await postbase.storage.from('docs').copy('template.pdf', 'copy.pdf')

// Bucket management
await postbase.storage.createBucket('avatars', { public: true, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ['image/png'] })
const { data: buckets } = await postbase.storage.listBuckets()
await postbase.storage.updateBucket('avatars', { public: false })
await postbase.storage.deleteBucket('avatars')
await postbase.storage.emptyBucket('avatars')
```

### RPC

```ts
const { data } = await postbase.rpc('get_nearby_posts', { lat: 37.77, lng: -122.42, radius: 10 })
```

### SSR (Next.js App Router)

```ts
// Server component
import { createServerClient } from 'postbasejs/ssr'
import { cookies } from 'next/headers'

const cookieStore = await cookies()
const postbase = createServerClient(
  process.env.NEXT_PUBLIC_POSTBASE_URL!,
  process.env.NEXT_PUBLIC_POSTBASE_ANON_KEY!,
  {
    projectId: process.env.NEXT_PUBLIC_POSTBASE_PROJECT_ID!,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  }
)

// middleware.ts — refreshes session
const postbase = createServerClient(url, anonKey, {
  projectId,
  cookies: {
    getAll: () => req.cookies.getAll(),
    setAll: (cookies) => cookies.forEach(c => res.cookies.set(c.name, c.value, c.options as any)),
  },
})
await postbase.auth.getSession()

// Client component
import { createBrowserClient } from 'postbasejs/ssr'
const postbase = createBrowserClient(url, anonKey, { projectId })
```

### Environment Variables

```
NEXT_PUBLIC_POSTBASE_URL=https://your-postbase-instance.com
NEXT_PUBLIC_POSTBASE_ANON_KEY=pb_anon_...
NEXT_PUBLIC_POSTBASE_PROJECT_ID=your-project-id
# Service key — server-side only, bypasses RLS
POSTBASE_SERVICE_KEY=pb_service_...
```

---

## Row Level Security (RLS)

When a user JWT is present (`X-Postbase-Token`), Postbase sets these session variables for use in policies:

```sql
current_setting('postbase.user_id', true)  -- authenticated user's ID
current_setting('postbase.role', true)     -- user's role
```

Example policy — users see only their own rows:

```sql
CREATE POLICY "own rows" ON posts
  FOR SELECT USING (
    user_id = current_setting('postbase.user_id', true)::uuid
  );
```

---

---

## Postbase Auth Tables & Project Schema

### CRITICAL: There is no `_system` schema

**Do NOT use `_system.users` or `_system.accounts` in SQL.** Postbase stores all tables — including auth tables — under the project schema, which is named `proj_<uuid-no-dashes>`. Any reference to `_system` will produce `ERROR: schema "_system" does not exist`.

The project schema name is derived by removing dashes from the project UUID:
- Project ID: `736ea91d-0014-4e58-a77a-0b454e94996f`
- Schema name: `proj_736ea91d00144e58a77a0b454e94996f`

### Auth tables (in the project schema)

#### `users`

Created/updated when a user signs up or updates their profile via any auth method.

```sql
CREATE TABLE "users" (
    "id"             uuid NOT NULL,
    "name"           text,
    "email"          text NOT NULL,
    "email_verified" timestamp without time zone,   -- NULL until verified; set on OAuth/Apple signup
    "image"          text,
    "password_hash"  text,
    "phone"          text,
    "phone_verified" timestamp without time zone,
    "is_anonymous"   boolean DEFAULT false,
    "metadata"       jsonb DEFAULT '{}'::jsonb,
    "banned_at"      timestamp without time zone,
    "created_at"     timestamp without time zone NOT NULL DEFAULT now(),
    "updated_at"     timestamp without time zone NOT NULL DEFAULT now()
);
```

#### `accounts`

One row per OAuth/Apple provider connection per user.

```sql
CREATE TABLE "accounts" (
    "user_id"             uuid NOT NULL,
    "type"                text NOT NULL,       -- e.g. "oauth"
    "provider"            text NOT NULL,       -- e.g. "apple", "google"
    "provider_account_id" text NOT NULL,       -- Apple sub / Google sub
    "refresh_token"       text,
    "access_token"        text,
    "expires_at"          integer,
    "token_type"          text,
    "scope"               text,
    "id_token"            text,
    "session_state"       text
);
```

**Key facts:**
- `users.id` is the canonical user UUID used in `current_setting('postbase.user_id', true)` for RLS
- `email_verified` is `NULL` for email/OTP users until they verify; set immediately for OAuth/Apple
- These tables live in the project schema — refer to them as just `users` / `accounts` inside trigger functions (after `SET search_path`)
- **Do NOT query `accounts` from inside a trigger** — the OAuth row may not exist yet when the `users` INSERT trigger fires

### Bridging `users` to your app table

Use a trigger on `users` to sync into your own account table. **Always `SET search_path` at the top of the function body** — this is mandatory, not optional.

```sql
-- my_accounts.id = users.id  (same UUID — enables direct RLS joins)
CREATE TABLE my_accounts (
    id         UUID PRIMARY KEY,   -- NOT gen_random_uuid() — must match users.id
    email      TEXT,
    full_name  TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION sync_postbase_user_to_my_accounts()
RETURNS TRIGGER AS $$
BEGIN
    -- MANDATORY: Postbase runs queries in the project schema, not public.
    -- Without this, table names won't resolve and the trigger silently fails.
    SET search_path TO "proj_<uuid-no-dashes>", public;

    IF TG_OP = 'INSERT' THEN
        -- For OAuth/Apple: email_verified is already set on INSERT.
        -- For email/OTP: email_verified is NULL; row is created anyway so
        -- the app table always has a record for every user.
        INSERT INTO my_accounts (id, email, full_name, created_at, updated_at)
        VALUES (NEW.id, NEW.email, NEW.name, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;

    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE my_accounts
        SET    email      = NEW.email,
               full_name  = COALESCE(NEW.name, full_name),
               updated_at = NOW()
        WHERE  id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fires on every signup (all auth methods)
CREATE TRIGGER trg_sync_postbase_user
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION sync_postbase_user_to_my_accounts();

-- Fires when user updates name/email via PATCH /auth/.../user
CREATE TRIGGER trg_sync_postbase_user_update
    AFTER UPDATE OF email, name ON users
    FOR EACH ROW EXECUTE FUNCTION sync_postbase_user_to_my_accounts();
```

**If you need the Apple sub (`provider_account_id`):** Do NOT fetch it from `accounts` inside the trigger — the `accounts` row may not exist yet. Instead, have the iOS/client code upsert it into your app table immediately after sign-in (you already have it from `ASAuthorizationAppleIDCredential.user`).

**RLS policy example** — using the synced id:

```sql
-- my_accounts.id = users.id, so RLS just works
CREATE POLICY "own account" ON my_accounts
    FOR ALL USING (id = current_setting('postbase.user_id', true)::uuid);

CREATE POLICY "own posts" ON posts
    FOR ALL USING (owner_id = current_setting('postbase.user_id', true)::uuid);
```

---

## Cron Jobs (node-cron based)

Postbase runs scheduled jobs via **node-cron** inside the Next.js server process (replaces pg_cron for Railway compatibility). Jobs execute SQL against the project's own database and are persisted in the `_postbase` schema.

### Schema

```sql
-- _postbase.cron_jobs
CREATE TABLE "_postbase"."cron_jobs" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "_postbase"."projects"("id") ON DELETE CASCADE,
  "name"       text NOT NULL,
  "schedule"   text NOT NULL,   -- standard 5-field cron expression
  "command"    text NOT NULL,   -- SQL to run against the project DB
  "active"     boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- _postbase.cron_job_runs
CREATE TABLE "_postbase"."cron_job_runs" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id"         uuid NOT NULL REFERENCES "_postbase"."cron_jobs"("id") ON DELETE CASCADE,
  "start_time"     timestamp DEFAULT now() NOT NULL,
  "end_time"       timestamp,
  "status"         text DEFAULT 'running' NOT NULL,  -- 'running' | 'succeeded' | 'failed'
  "return_message" text   -- error message on failure
);
```

### Cron API — `POST /api/dashboard/{projectId}/cron`

All actions use `POST` with a JSON body containing `"action"`.

#### List jobs (GET)
```
GET /api/dashboard/{projectId}/cron
Authorization: Bearer <service_key>
→ { installed: true, jobs: [{ jobid, jobname, schedule, command, active, runs: [...] }] }
   runs: [{ start_time, end_time, status, return_message }]   (last 5 per job)
```

#### Install (no-op — node-cron is always available)
```json
{ "action": "install" }
→ { "ok": true }
```

#### Create a job
```json
{
  "action": "create",
  "jobName": "cleanup-old-sessions",
  "schedule": "0 3 * * *",
  "command": "DELETE FROM sessions WHERE created_at < NOW() - INTERVAL '30 days'"
}
→ { "ok": true }
```
- Returns `400` if schedule is an invalid cron expression
- Returns `400` if a job with the same name already exists in the project

#### Toggle active/inactive
```json
{ "action": "toggle", "jobId": "<uuid>", "active": false }
→ { "ok": true }
```

#### Delete a job
```json
{ "action": "delete", "jobName": "cleanup-old-sessions" }
→ { "ok": true }
```

### Scheduler internals (`lib/scheduler.ts`)

```ts
import { scheduleJob, unscheduleJob, loadAllJobs } from '@/lib/scheduler'

// Schedule or reschedule a job (validates cron expression first)
scheduleJob(jobId, projectId, '0 3 * * *', 'DELETE FROM ...', databaseUrl)

// Stop and remove a job from the in-process map
unscheduleJob(jobId)

// Called on server boot (instrumentation.ts) — loads all active jobs from DB
await loadAllJobs()
```

**Key behaviours:**
- Jobs run inside the Next.js server process — no separate worker needed
- Each run sets `search_path` to the project schema before executing SQL
- Run history is capped at 100 entries per job (oldest pruned automatically)
- `loadAllJobs()` is wired into `instrumentation.ts` so jobs survive server restarts
- `nodeCron.validate(schedule)` is called before persisting — invalid expressions return `400`

### Migration

Apply via:
```bash
pnpm db:push
# or run drizzle/0006_cron_jobs.sql directly on the _postbase schema
```

---

## Swift / iOS Integration Notes

When calling the Postbase REST API directly from Swift (no SDK):

- **API key** → `Authorization: Bearer <key>` header
- **User JWT** → `X-Postbase-Token: <token>` header (for RLS)
- **Do NOT** pass `columns: ["*"]` — Postbase rejects the wildcard; omit `columns` entirely for all columns
- **Do NOT** send `X-Project-ID` — not a real Postbase header; project is identified by the API key
- **Upsert** does not accept an `onConflict` field in the REST body — conflict resolution is configured server-side on the table
- Filter objects must use the key `"operator"` (not `"op"`)
- Auth endpoints need `/{projectId}` in the path; the DB query endpoint (`/api/db/query`) does not
