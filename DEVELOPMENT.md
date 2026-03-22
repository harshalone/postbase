# Postbase — Development Reference

> Quick-reference for all architectural decisions, conventions, and patterns in this codebase.
> Keep this file updated as new features are added.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router, v16) |
| Language | TypeScript v5 |
| Database ORM | Drizzle ORM v0.38 + `pg` driver |
| Auth (dashboard) | NextAuth.js v5 (beta) + `@auth/drizzle-adapter` |
| Auth (SDK) | Custom JWT — Web Crypto API HS256, no external library |
| UI | Tailwind CSS v4 + Radix UI primitives |
| Icons | lucide-react |
| Monorepo | Turbo + pnpm workspaces |
| Storage backend | MinIO (S3-compatible); also supports AWS S3, Cloudflare R2 |
| Storage signing | AWS Signature V4 — Web Crypto API, no AWS SDK |
| Email | nodemailer v7 |
| Password hashing | bcryptjs |
| ID generation | nanoid |
| SDK build | tsup (CJS + ESM + `.d.ts`) |
| SDK package name | `postbasejs` |

---

## Monorepo Layout

```
postbase/
├── apps/
│   └── web/                   ← Main Next.js app (dashboard + all API routes)
│       ├── src/
│       │   ├── app/           ← Next.js App Router pages + API routes
│       │   └── lib/           ← Shared utilities
│       └── drizzle.config.ts
└── packages/
    └── client/                ← postbasejs npm package (SDK for end users)
        ├── src/
        │   ├── index.ts       ← main entry
        │   ├── client.ts      ← PostbaseClient implementation
        │   ├── types.ts       ← all public TypeScript types
        │   └── ssr/index.ts   ← postbasejs/ssr subpackage
        └── tsup.config.ts
```

---

## Brand & Styling

- **Accent color**: Terracotta `#C4623A` — always use `brand-*` Tailwind tokens, never hardcode
- **Theme**: Dark — `zinc-950` background, `zinc-100` foreground
- **Token range**: `brand-50` through `brand-900` defined in `globals.css` via `@theme`
- **Every clickable element must have `cursor-pointer`** — buttons, links, toggles, selects
- Tailwind v4 uses `@theme` directive (not `tailwind.config.js` theme extension)

---

## Database Architecture

### Internal Schema (`_postbase`)

All Postbase platform tables live in the `_postbase` PostgreSQL schema, managed by Drizzle ORM.

**Tables:**

| Table | Purpose |
|---|---|
| `organisations` | Groups of projects |
| `projects` | Individual Postbase instances |
| `users` | Per-project auth users |
| `accounts` | OAuth provider connections (Auth.js compatible) |
| `sessions` | User sessions (refresh token store) |
| `verification_tokens` | Email/magic link tokens |
| `provider_configs` | Per-project OAuth provider config |
| `email_settings` | Per-project SMTP configuration |
| `email_templates` | Per-project email templates (e.g. `magic_link`) |
| `storage_buckets` | File storage bucket definitions |
| `storage_objects` | Files within buckets |
| `storage_connections` | Per-project S3/R2/GCS credentials |
| `api_keys` | Anon + service role keys per project |
| `audit_logs` | Action audit trail |

### Per-Project Schema (User Data Isolation)

Each project gets its own PostgreSQL schema for user-created tables:

```
Schema name: proj_<projectId_without_hyphens>
Example:     proj_550e8400e29b41d4a716446655440000
```

**Utility:** `src/lib/project-db.ts`

```typescript
getProjectSchema(projectId)          // returns schema name string
getProjectPool(databaseUrl?)         // returns pg.Pool (per-project DB or global)
ensureProjectSchema(client, id)      // CREATE SCHEMA IF NOT EXISTS, returns name
withProjectSchema(pool, id, fn)      // runs fn with search_path set
```

Projects can optionally have their own `databaseUrl` (stored in `projects.database_url`). If not set, the global `DATABASE_URL` env var is used.

### DB Connection

```typescript
// src/lib/db/index.ts
import { db } from "@/lib/db";  // Drizzle instance for _postbase schema
```

---

## Project Isolation Rules

| Resource | Isolation strategy |
|---|---|
| User tables | PostgreSQL schema `proj_<id>` |
| Cron jobs | Named `pb_<id>_<jobName>` in `cron.job` |
| Message queues | Named `pb_<id>_<queueName>` in pgmq |
| RLS policies | Scoped to project schema tables |

---

## App Router Structure

```
app/
├── dashboard/
│   ├── layout.tsx                        ← Outer shell (session check)
│   ├── (main)/
│   │   ├── layout.tsx
│   │   └── page.tsx                      ← Org/project listing
│   └── [projectId]/
│       ├── layout.tsx                    ← Uses <ProjectSidebar>, checks project exists
│       ├── page.tsx                      ← Overview / stats
│       ├── _components/
│       │   └── sidebar.tsx               ← Collapsible sidebar (client component)
│       ├── auth/page.tsx                 ← OAuth provider config
│       ├── users/page.tsx                ← User management
│       ├── database/page.tsx             ← Tables + SQL Editor + RLS (client)
│       ├── storage/page.tsx              ← Storage buckets (placeholder)
│       ├── integrations/page.tsx         ← pg_cron + pgmq (client)
│       ├── api-keys/page.tsx             ← Anon + service role keys
│       ├── logs/page.tsx                 ← Audit logs (placeholder)
│       └── settings/page.tsx            ← Project settings (placeholder)
├── api/
│   ├── auth/[projectId]/[...nextauth]/   ← Multi-tenant NextAuth handler (dashboard)
│   ├── auth/v1/                          ← SDK auth endpoints
│   │   ├── signup/route.ts
│   │   ├── token/route.ts                ← password + refresh_token grants
│   │   ├── user/route.ts
│   │   ├── session/route.ts
│   │   ├── logout/route.ts
│   │   ├── otp/route.ts                  ← magic link sender
│   │   ├── verify/route.ts               ← magic link verifier
│   │   └── admin/users/[id]/route.ts
│   ├── db/query/route.ts                 ← SDK query builder backend
│   ├── rpc/[fn]/route.ts                 ← PostgreSQL RPC calls
│   ├── storage/v1/                       ← SDK storage endpoints
│   │   ├── bucket/route.ts
│   │   ├── bucket/[id]/route.ts
│   │   ├── bucket/[id]/empty/route.ts
│   │   ├── object/[bucket]/route.ts      ← DELETE multiple
│   │   ├── object/[bucket]/[...path]/route.ts ← upload/download
│   │   ├── object/list/[bucket]/route.ts
│   │   ├── object/sign/[bucket]/[...path]/route.ts
│   │   ├── object/move/route.ts
│   │   ├── object/copy/route.ts
│   │   └── object/public/[bucket]/[...path]/route.ts ← no-auth public serve
│   └── dashboard/
│       ├── projects/route.ts
│       ├── organisations/route.ts
│       ├── providers/route.ts
│       ├── email-settings/route.ts
│       ├── email-templates/route.ts
│       └── [projectId]/
│           ├── tables/route.ts           ← List tables, create table
│           ├── tables/[tableName]/route.ts ← CRUD rows
│           ├── tables/[tableName]/columns/route.ts ← ADD COLUMN
│           ├── sql/route.ts              ← Run arbitrary SQL
│           ├── rls/route.ts              ← RLS policy management
│           ├── cron/route.ts             ← pg_cron job management
│           ├── queues/route.ts           ← pgmq queue management
│           └── storage/route.ts          ← Storage connection management
```

---

## Sidebar (`_components/sidebar.tsx`)

- **Client component** — uses `useState`, `useEffect`, `usePathname`
- Collapsed state persisted in `localStorage` key `"sidebar-collapsed"`
- Collapsed width: `w-16`, expanded: `w-60`
- Active link detection via `pathname.startsWith(href)`
- **To add a nav item**, add to `NAV_ITEMS` array with `{ label, icon, suffix }`
- Current nav items:

```typescript
const NAV_ITEMS = [
  { label: "Overview",      icon: LayoutDashboard, suffix: ""              },
  { label: "Auth Providers",icon: Shield,           suffix: "/auth"         },
  { label: "Users",         icon: Users,            suffix: "/users"        },
  { label: "Database",      icon: Database,         suffix: "/database"     },
  { label: "Storage",       icon: HardDrive,        suffix: "/storage"      },
  { label: "Integrations",  icon: Puzzle,           suffix: "/integrations" },
  { label: "API Keys",      icon: Key,              suffix: "/api-keys"     },
  { label: "Audit Logs",    icon: ScrollText,       suffix: "/logs"         },
  { label: "Settings",      icon: Settings,         suffix: "/settings"     },
];
```

---

## API Route Conventions

### Pattern for all `[projectId]` routes

```typescript
// 1. Validate project exists
const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

// 2. Get pool (uses project's own DB or global)
const pool = getProjectPool(project.databaseUrl);
const client = await pool.connect();
try {
  // 3. Ensure schema exists
  const schema = await ensureProjectSchema(client, projectId);
  // ... do work ...
} finally {
  client.release();
  await pool.end();
}
```

### Response shape conventions
- Success: `{ ok: true }` or `{ data: ... }`
- Error: `{ error: "message" }` with appropriate status code
- List: `{ tableName: [...] }` e.g. `{ tables: [...] }`, `{ jobs: [...] }`

---

## Authentication

### Dashboard auth (internal)
- **Multi-tenant**: each project has its own NextAuth endpoint at `/api/auth/[projectId]/[...nextauth]`
- Auth config built dynamically: `buildAuthConfig(projectId, enabledProviders)` in `lib/auth/config.ts`
- Providers fetched from `provider_configs` table per project

### API Keys
Generated with nanoid, validated via `validateApiKey()` in `lib/auth/keys.ts`:
- Anon key: `pb_anon_<64chars>` — used by end-user clients
- Service role key: `pb_service_<64chars>` — bypasses RLS, admin operations only

### JWT (`lib/auth/jwt.ts`)
Lightweight HS256 implementation using the Web Crypto API (no external library). Works in Node 18+ and Edge runtime.

```typescript
signJwt(payload, secret)       // → signed JWT string
verifyJwt(token, secret)       // → JwtPayload | null (checks exp)
decodeJwtUnsafe(token)         // → JwtPayload | null (no signature check)
getJwtSecret()                 // reads POSTBASE_JWT_SECRET ?? NEXTAUTH_SECRET
```

Payload shape:
```typescript
{ sub: string, pid: string, email: string, role?: string, iat, exp, jti? }
```

Token TTLs: access = 1 hour, refresh = 7 days (rotated on use).

### SDK Auth API (`/api/auth/v1/`)

| Route | Method | Purpose | Auth required |
|---|---|---|---|
| `/api/auth/v1/signup` | POST | Create user + issue tokens | Anon key |
| `/api/auth/v1/token` | POST | `grant_type=password` or `grant_type=refresh_token` | Anon key |
| `/api/auth/v1/user` | GET | Get current user from JWT | Bearer access token |
| `/api/auth/v1/user` | PATCH | Update name/image/metadata | Bearer access token |
| `/api/auth/v1/session` | GET | Validate session, issue fresh access token | `X-Postbase-Session` |
| `/api/auth/v1/logout` | POST | Delete all sessions for user | Bearer access token |
| `/api/auth/v1/otp` | POST | Send magic link email | Anon key |
| `/api/auth/v1/verify` | GET | Verify magic link token, set cookie, redirect | None (token in URL) |
| `/api/auth/v1/admin/users` | GET | List users (paginated) | Service key |
| `/api/auth/v1/admin/users` | POST | Create user | Service key |
| `/api/auth/v1/admin/users/[id]` | GET/PATCH/DELETE | Manage individual user | Service key |

Magic link flow: `otp` → sends email via nodemailer → user clicks link → `verify` issues session + sets `postbase-session` cookie + redirects.

---

## Database Page (`/database`)

Three tabs — all client-side data fetching. No header/description — tab buttons are shown directly at the top.

| Tab | Features |
|---|---|
| Tables | Left sidebar table list, row data grid with column headers, sort/filter toolbar, Insert dropdown menu, pagination, Data/Definition toggle |
| SQL Editor | Write + run SQL (⌘+Enter), results grid, error display |
| RLS Policies | Left sidebar table list (green dot = RLS on), right panel shows policies for selected table |

### Tables tab details

- **Create table**: right-side slideover with name/description, RLS toggle, Realtime toggle, column builder with drag-and-drop reorder (native HTML5), add/remove columns
- **Insert dropdown** (brand button, top-right): opens a menu with 3 options:
  - **Insert row** → right slideover — one field per column, required vs optional sections, datetime/text/generic inputs per type, "Create more" toggle
  - **Insert column** → right slideover — General (name + description), Data Type (type select, array checkbox, default value), Foreign Keys, Constraints (primary key toggle), "Create more" toggle; calls `POST /api/.../tables/[tableName]/columns` which runs `ALTER TABLE ... ADD COLUMN`
  - **Import data from CSV** → stub (not yet implemented)
- **Column headers**: read from `selectedTableMeta.columns` fetched with tables list

### RLS tab details

- Left sidebar: lists all tables with a coloured dot (green = enabled, grey = disabled)
- Selecting a table shows:
  - Enable/Disable RLS toggle button
  - New Policy button (only visible when RLS is enabled)
  - Empty state prompts when RLS is off or no policies exist
  - Policy list with coloured command badges (SELECT=blue, INSERT=green, UPDATE=yellow, DELETE=red, ALL=grey) and drop button
- **New Policy slideover** is a split panel (860px wide):
  - **Left (form)**: Policy Name, Table (`on` clause), Policy Behavior (`as` clause — Permissive/Restrictive), Policy Command (`for` clause — styled radio buttons SELECT/INSERT/UPDATE/DELETE/ALL), Target Roles (`to` clause), live SQL preview, USING / WITH CHECK inputs (shown based on command)
  - **Right (templates)**: searchable list of template cards with coloured command badge + title + description; clicking fills the form

### RLS — backend reality

All RLS actions run **real SQL** against PostgreSQL via `POST /api/dashboard/[projectId]/rls`:

| Action | SQL |
|---|---|
| Enable RLS | `ALTER TABLE "schema"."table" ENABLE ROW LEVEL SECURITY` |
| Disable RLS | `ALTER TABLE "schema"."table" DISABLE ROW LEVEL SECURITY` |
| Create policy | `CREATE POLICY "name" ON "schema"."table" AS PERMISSIVE/RESTRICTIVE FOR cmd USING (...) WITH CHECK (...)` |
| Drop policy | `DROP POLICY IF EXISTS "name" ON "schema"."table"` |

Policies are read from `pg_policies` and RLS state from `pg_class.relrowsecurity` — live database state, not cached.

> ⚠️ Template expressions like `auth.uid()` are Supabase-specific. On plain PostgreSQL use `current_setting('app.user_id', true)::uuid` or similar that your app sets via `SET LOCAL`.

### New API routes added

| Route | Method | Purpose |
|---|---|---|
| `/api/dashboard/[projectId]/tables/[tableName]/columns` | POST | Add a column — runs `ALTER TABLE ... ADD COLUMN` |

### RLS templates

| Command | Label | USING | WITH CHECK |
|---|---|---|---|
| SELECT | Enable read access for all users | `true` | — |
| INSERT | Enable insert for authenticated users only | — | `auth.role() = 'authenticated'` |
| DELETE | Enable delete for users based on user_id | `auth.uid() = user_id` | — |
| INSERT | Enable insert for users based on user_id | — | `auth.uid() = user_id` |
| UPDATE | Policy with table joins | `auth.uid() IN (SELECT ...)` | — |
| ALL | Policy with security definer functions | `is_member_of(auth.uid(), team_id)` | — |

---

## Integrations Page (`/integrations`)

Single page with two tabs. Both extensions show an **install button** if the extension is not yet enabled.

### pg_cron tab

- Jobs scoped by prefix: `pb_<projectId_compact>_<jobName>`
- On create, wraps SQL with `SET search_path TO "<schema>", public;` so unqualified table names work
- Toggle active/inactive, view last 5 run history, delete jobs
- Schedule presets: every minute, 5 min, hourly, daily, weekly

### pgmq tab

- Queues scoped by prefix: `pb_<projectId_compact>_<queueName>`
- Display name strips the prefix
- Browse messages, send JSON messages, delete individual messages, drop queue
- Default visibility timeout: 30s, default read limit: 20 messages

---

## Drizzle ORM

Config at `apps/web/drizzle.config.ts` — filters schemas `_postbase` and `public`.

```bash
# Generate migrations
pnpm drizzle-kit generate

# Push schema directly (dev)
pnpm drizzle-kit push
```

Import pattern:
```typescript
import { db } from "@/lib/db";
import { projects, users, ... } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
```

---

## Storage

### Storage API (`/api/storage/v1/`)

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/storage/v1/bucket` | GET | List buckets | API key |
| `/api/storage/v1/bucket` | POST | Create bucket | API key |
| `/api/storage/v1/bucket/[id]` | GET/PUT/DELETE | Get/update/delete bucket | API key |
| `/api/storage/v1/bucket/[id]/empty` | POST | Delete all objects in bucket | API key |
| `/api/storage/v1/object/[bucket]/[...path]` | POST | Upload object | API key |
| `/api/storage/v1/object/[bucket]/[...path]` | PUT | Upsert object | API key |
| `/api/storage/v1/object/[bucket]/[...path]` | GET | Download object | API key (or public) |
| `/api/storage/v1/object/[bucket]` | DELETE | Delete multiple objects | API key |
| `/api/storage/v1/object/list/[bucket]` | POST | List objects with prefix/pagination | API key |
| `/api/storage/v1/object/sign/[bucket]/[...path]` | POST | Generate pre-signed URL | API key |
| `/api/storage/v1/object/move` | POST | Move/rename object | API key |
| `/api/storage/v1/object/copy` | POST | Copy object | API key |
| `/api/storage/v1/object/public/[bucket]/[...path]` | GET | Serve public object (no auth) | None |

Buckets support: `public` flag, `allowedMimeTypes[]`, `fileSizeLimit` (bytes).

### Storage client (`lib/storage/client.ts`)

Full AWS Signature V4 implementation using Web Crypto API — no AWS SDK dependency.

```typescript
getStorageClient(projectId)  // → StorageAdapter
```

Lookup order: project's default `storage_connections` row → falls back to `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` env vars.

`StorageAdapter` interface: `putObject`, `getObject`, `deleteObject`, `deleteObjects`, `listObjects`, `copyObject`, `headObject`, `getSignedUrl`.

---

## Database Query API (`/api/db/query`)

Single endpoint used by the SDK `from()` query builder.

**Request body:**
```typescript
{
  table: string,
  operation: "select" | "insert" | "update" | "delete" | "upsert",
  filters?: Array<{ column, operator, value }>,
  orFilters?: string[],       // raw SQL OR fragments
  notFilters?: Array<{ column, operator, value }>,
  select?: string,            // column list, default "*"
  count?: "exact",
  head?: boolean,             // return only count, no rows
  order?: { column, ascending },
  limit?: number,
  offset?: number,
  data?: object | object[],   // for insert/update/upsert
  returning?: string,         // e.g. "*" or "id, name"
  conflictColumns?: string[], // for upsert
}
```

**Filter operators:** `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `is`, `contains` (`@>`), `overlaps` (`&&`), `textSearch` (`to_tsvector @@ plainto_tsquery`)

**Auth / RLS headers:**
- `Authorization: Bearer <api-key>` — identifies project
- `X-Postbase-Token` or `X-Postbase-Session` — user JWT; sets `postbase.user_id` and `postbase.role` via `set_config()` so RLS policies can use `current_setting('postbase.user_id')`

---

## RPC API (`/api/rpc/[fn]`)

Calls a PostgreSQL function in the project's schema.

```
POST /api/rpc/my_function
Body: { arg1: value1, arg2: value2 }
```

Executes: `SELECT * FROM schema.my_function(arg1 => $1, arg2 => $2)`

Supports `count: "exact"` in body and `HEAD` method for count-only responses. Sets RLS context same as `/api/db/query`.

---

## postbasejs SDK (`packages/client`)

Published npm package. Supabase-compatible API surface for end users.

### Install
```bash
npm install postbasejs
```

### Basic usage
```typescript
import { createClient } from 'postbasejs'

const postbase = createClient('https://your-postbase.com', 'pb_anon_...')

// Query
const { data, error } = await postbase.from('posts').select('*').order('created_at', { ascending: false })

// Auth
await postbase.auth.signInWithPassword({ email, password })
const { data: { user } } = await postbase.auth.getUser()

// Storage
await postbase.storage.from('avatars').upload('user.png', file)
const { data } = postbase.storage.from('avatars').getPublicUrl('user.png')

// RPC
const { data } = await postbase.rpc('my_function', { arg: 'value' })
```

### SSR usage (`postbasejs/ssr`)
```typescript
import { createServerClient, createBrowserClient } from 'postbasejs/ssr'

// Server Component / middleware (needs cookie adapter)
const postbase = createServerClient(url, anonKey, {
  cookies: {
    getAll: () => cookieStore.getAll(),
    setAll: (cookies) => cookies.forEach(c => res.cookies.set(c.name, c.value, c.options)),
  }
})

// Client Component
const postbase = createBrowserClient(url, anonKey)
```

Session cookie name: `postbase-session`. Forwarded as `X-Postbase-Session` header so server-side queries apply RLS for the authenticated user.

### Query builder methods

`from(table)` returns a `QueryBuilder<T>` with:
- `.select(columns?, { count? })` — column list, optional exact count
- `.eq/neq/gt/gte/lt/lte/like/ilike(col, val)` — filter operators
- `.in(col, values)` / `.is(col, val)` / `.contains(col, val)` / `.overlaps(col, val)` / `.textSearch(col, query)`
- `.or(filters)` / `.not(col, op, val)`
- `.order(col, { ascending })` / `.limit(n)` / `.range(from, to)`
- `.single()` / `.maybeSingle()` — expect exactly one row
- `.insert(data)` / `.update(data)` / `.delete()` / `.upsert(data, { onConflict })`
- `.returning(cols)` — return specific columns after mutation

### Auth client (`postbase.auth`)
`signUp`, `signInWithPassword`, `signInWithOtp`, `signOut`, `getSession`, `getUser`, `refreshSession`, `onAuthStateChange`, `updateUser`, `admin.*`

### Storage client (`postbase.storage`)
`from(bucket)` → `StorageBucketClient`:
`upload`, `download`, `remove`, `list`, `getPublicUrl`, `createSignedUrl`, `move`, `copy`

Bucket management: `postbase.storage.createBucket`, `getBucket`, `listBuckets`, `updateBucket`, `deleteBucket`, `emptyBucket`

### Build

```bash
cd packages/client
pnpm build   # tsup → dist/ (CJS + ESM + .d.ts)
```

Exports:
- `postbasejs` → `dist/index.{js,mjs}` + `dist/index.d.ts`
- `postbasejs/ssr` → `dist/ssr/index.{js,mjs}` + `dist/ssr/index.d.ts`

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Global PostgreSQL connection string |
| `NEXTAUTH_SECRET` | NextAuth + fallback JWT secret |
| `NEXTAUTH_URL` | App base URL |
| `POSTBASE_JWT_SECRET` | JWT signing secret (preferred over `NEXTAUTH_SECRET`) |
| `MINIO_ENDPOINT` | MinIO endpoint (default: `http://localhost:9000`) |
| `MINIO_ACCESS_KEY` | MinIO access key (default: `minioadmin`) |
| `MINIO_SECRET_KEY` | MinIO secret key (default: `minioadmin`) |

---

## Page Template (new placeholder page)

```tsx
export default async function FooPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await params;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Page Title</h1>
      <p className="text-zinc-400 mb-8">Description.</p>
      {/* content */}
    </div>
  );
}
```

## Interactive Page Template (client)

```tsx
"use client";

import { useState, use } from "react";

export default function FooPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  // ...
}
```

---

## Common UI Patterns

### Tab bar
```tsx
<div className="flex gap-1 mt-5">
  <button
    onClick={() => setTab("foo")}
    className={`cursor-pointer flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      tab === "foo" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
    }`}
  >
    <Icon size={14} /> Label
  </button>
</div>
```

### Modal dialog
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
  <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
    {/* header */}
    <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
      <h2 className="text-lg font-semibold text-white">Title</h2>
      <button onClick={close} className="cursor-pointer p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
        <X size={16} />
      </button>
    </div>
    {/* body */}
    <div className="px-6 py-4 space-y-4">{/* fields */}</div>
    {/* footer */}
    <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800">
      <button onClick={close} className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">Cancel</button>
      <button onClick={submit} className="cursor-pointer px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors">Submit</button>
    </div>
  </div>
</div>
```

### Data table
```tsx
<div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
        <th className="text-left px-6 py-3 font-medium">Column</th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-zinc-800 hover:bg-zinc-800/30">
        <td className="px-6 py-3 text-zinc-300">value</td>
      </tr>
    </tbody>
  </table>
</div>
```

### Brand button
```tsx
<button className="cursor-pointer px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors">
  Action
</button>
```

### Input field
```tsx
<input className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500" />
```
