# postbasejs

The official JavaScript/TypeScript client for [Postbase](https://www.getpostbase.com) — a self-hosted, open-source backend as a service.

[![npm version](https://img.shields.io/npm/v/postbasejs)](https://www.npmjs.com/package/postbasejs)
[![license](https://img.shields.io/npm/l/postbasejs)](https://github.com/postbase/postbase/blob/main/LICENSE)

> **[getpostbase.com](https://www.getpostbase.com)** · [Documentation](https://www.getpostbase.com/docs) · [GitHub](https://github.com/postbase/postbase)

---

## What is Postbase?

Postbase is a self-hosted backend platform built on PostgreSQL. It gives you a database with a REST query API, authentication (password, magic link, OAuth), file storage, and row-level security — all running on your own infrastructure.

`postbasejs` is the client SDK for interacting with your Postbase instance from JavaScript or TypeScript apps.

---

## Screenshots

<p align="center">
  <img src="https://raw.githubusercontent.com/harshalone/postbase/main/images/1.png" alt="Postbase landing" width="100%" />
  <br/><em>Self-hosted auth + database platform for Next.js</em>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/harshalone/postbase/main/images/2.png" alt="Dashboard" width="100%" />
  <br/><em>Dashboard — manage organisations and projects</em>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/harshalone/postbase/main/images/3.png" alt="Project overview" width="100%" />
  <br/><em>Project overview with quick-start guide</em>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/harshalone/postbase/main/images/4.png" alt="Auth providers" width="100%" />
  <br/><em>25+ auth providers — toggle any from the dashboard</em>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/harshalone/postbase/main/images/5.png" alt="SQL editor" width="100%" />
  <br/><em>Built-in SQL editor with AI query generation</em>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/harshalone/postbase/main/images/6.png" alt="Storage connections" width="100%" />
  <br/><em>S3-compatible storage — connect Amazon S3, Cloudflare R2, Backblaze B2, and more</em>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/harshalone/postbase/main/images/7.png" alt="Cron jobs" width="100%" />
  <br/><em>Scheduled cron jobs — run SQL snippets or HTTP requests on any schedule</em>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/harshalone/postbase/main/images/8.png" alt="API keys" width="100%" />
  <br/><em>API keys — anon and service role keys with SDK snippet</em>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/harshalone/postbase/main/images/9.png" alt="Project settings" width="100%" />
  <br/><em>Project settings — configure auth redirect URLs, JWT expiry, and more</em>
</p>

---

## Installation

```bash
npm install postbasejs
# or
pnpm add postbasejs
# or
yarn add postbasejs
```

---

## Quick Start

```typescript
import { createClient } from 'postbasejs'

const postbase = createClient(
  'https://your-postbase-instance.com',
  'pb_anon_your_api_key'
)
```

Your **URL** and **anon key** can be found in the API Keys section of your Postbase dashboard.

---

## Database

Query your PostgreSQL tables with a fluent, chainable API.

### Select

```typescript
// Fetch all posts
const { data, error } = await postbase.from('posts').select('*')

// Select specific columns
const { data } = await postbase.from('posts').select('id, title, created_at')

// With filters
const { data } = await postbase
  .from('posts')
  .select('*')
  .eq('status', 'published')
  .order('created_at', { ascending: false })
  .limit(10)

// Get total count
const { data, count } = await postbase
  .from('posts')
  .select('*', { count: 'exact' })
```

### Filter operators

| Method | SQL equivalent |
|---|---|
| `.eq(col, val)` | `col = val` |
| `.neq(col, val)` | `col != val` |
| `.gt(col, val)` | `col > val` |
| `.gte(col, val)` | `col >= val` |
| `.lt(col, val)` | `col < val` |
| `.lte(col, val)` | `col <= val` |
| `.like(col, pattern)` | `col LIKE pattern` |
| `.ilike(col, pattern)` | `col ILIKE pattern` |
| `.in(col, values)` | `col IN (values)` |
| `.is(col, null)` | `col IS NULL` |
| `.contains(col, val)` | `col @> val` |
| `.overlaps(col, val)` | `col && val` |
| `.textSearch(col, query)` | full-text search |
| `.or(filters)` | `col = val OR col = val` |
| `.not(col, op, val)` | `NOT col op val` |

### Insert

```typescript
const { data, error } = await postbase
  .from('posts')
  .insert({ title: 'Hello World', status: 'draft' })
  .select()
  .single()
```

### Update

```typescript
const { data, error } = await postbase
  .from('posts')
  .update({ status: 'published' })
  .eq('id', 'post-id')
  .select()
  .single()
```

### Upsert

```typescript
const { data, error } = await postbase
  .from('profiles')
  .upsert({ id: 'user-id', username: 'alice' }, { onConflict: 'id' })
  .select()
```

### Delete

```typescript
const { error } = await postbase
  .from('posts')
  .delete()
  .eq('id', 'post-id')
```

### Single row helpers

```typescript
// Errors if not exactly one row
const { data, error } = await postbase.from('posts').select('*').eq('id', id).single()

// Returns null if not found (no error)
const { data } = await postbase.from('posts').select('*').eq('id', id).maybeSingle()
```

### Pagination

```typescript
// Limit + offset
const { data } = await postbase.from('posts').select('*').limit(20).offset(40)

// Range (inclusive)
const { data } = await postbase.from('posts').select('*').range(0, 19)
```

---

## Authentication

### Sign up

```typescript
const { data, error } = await postbase.auth.signUp({
  email: 'user@example.com',
  password: 'supersecret',
})
// data.user, data.session
```

### Sign in with password

```typescript
const { data, error } = await postbase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'supersecret',
})
```

### Magic link (passwordless)

```typescript
const { error } = await postbase.auth.signInWithOtp({
  email: 'user@example.com',
  options: { redirectTo: 'https://yourapp.com/dashboard' },
})
```

### OAuth (browser redirect)

```typescript
await postbase.auth.signInWithOAuth({
  provider: 'google', // or 'github', 'discord', etc.
  options: { redirectTo: 'https://yourapp.com/callback' },
})
```

### Get current user

```typescript
const { data: { user }, error } = await postbase.auth.getUser()
```

### Get current session

```typescript
const { data: { session }, error } = await postbase.auth.getSession()
// session.accessToken, session.user, session.expiresAt
```

### Sign out

```typescript
await postbase.auth.signOut()
```

### Update user

```typescript
const { data, error } = await postbase.auth.updateUser({
  name: 'Alice',
  metadata: { plan: 'pro' },
})
```

### Listen to auth state changes

```typescript
const { data: { subscription } } = postbase.auth.onAuthStateChange((event, session) => {
  // event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED'
  console.log(event, session)
})

// Cleanup
subscription.unsubscribe()
```

### Admin (service role key required)

```typescript
const adminClient = createClient(url, 'pb_service_your_service_key')

// List users
const { data } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 50 })

// Create user
const { data } = await adminClient.auth.admin.createUser({
  email: 'new@example.com',
  password: 'password',
  email_confirm: true,
})

// Update user
await adminClient.auth.admin.updateUserById(userId, { email: 'new@example.com' })

// Delete user
await adminClient.auth.admin.deleteUser(userId)
```

---

## Storage

### Upload a file

```typescript
const { data, error } = await postbase
  .storage
  .from('avatars')
  .upload('user-123.png', file, { contentType: 'image/png' })
// data.path, data.fullPath
```

### Get public URL

```typescript
const { data: { publicUrl } } = postbase
  .storage
  .from('avatars')
  .getPublicUrl('user-123.png')
```

### Download a file

```typescript
const { data: blob, error } = await postbase
  .storage
  .from('avatars')
  .download('user-123.png')
```

### Create a signed URL (temporary access)

```typescript
const { data, error } = await postbase
  .storage
  .from('private-docs')
  .createSignedUrl('report.pdf', 3600) // expires in 1 hour
// data.signedUrl
```

### List files

```typescript
const { data, error } = await postbase
  .storage
  .from('avatars')
  .list('folder/', { limit: 100, sortBy: { column: 'name', order: 'asc' } })
```

### Delete files

```typescript
const { error } = await postbase
  .storage
  .from('avatars')
  .remove(['user-123.png', 'user-456.png'])
```

### Move / Copy

```typescript
await postbase.storage.from('docs').move('old-name.pdf', 'new-name.pdf')
await postbase.storage.from('docs').copy('template.pdf', 'copy.pdf')
```

### Bucket management

```typescript
// Create
await postbase.storage.createBucket('avatars', {
  public: true,
  fileSizeLimit: 5 * 1024 * 1024, // 5 MB
  allowedMimeTypes: ['image/png', 'image/jpeg'],
})

// List
const { data: buckets } = await postbase.storage.listBuckets()

// Update
await postbase.storage.updateBucket('avatars', { public: false })

// Delete
await postbase.storage.deleteBucket('avatars')

// Empty (delete all objects)
await postbase.storage.emptyBucket('avatars')
```

---

## RPC (PostgreSQL functions)

Call a stored procedure or function in your project's schema:

```typescript
const { data, error } = await postbase.rpc('get_nearby_posts', {
  lat: 37.7749,
  lng: -122.4194,
  radius: 10,
})
```

---

## SSR (Server-Side Rendering)

For Next.js App Router, SvelteKit, Nuxt, or any SSR framework, import from `postbasejs/ssr`. This forwards the user's session cookie to Postbase so that RLS policies apply server-side.

```bash
# No extra install needed — it's included in postbasejs
```

### Next.js App Router

**Server Component:**

```typescript
import { createServerClient } from 'postbasejs/ssr'
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()

  const postbase = createServerClient(
    process.env.NEXT_PUBLIC_POSTBASE_URL!,
    process.env.NEXT_PUBLIC_POSTBASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {}, // read-only in server components
      },
    }
  )

  const { data: posts } = await postbase.from('posts').select('*')
  return <ul>{posts?.map(p => <li key={p.id}>{p.title}</li>)}</ul>
}
```

**Middleware (session refresh):**

```typescript
// middleware.ts
import { createServerClient } from 'postbasejs/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const postbase = createServerClient(
    process.env.NEXT_PUBLIC_POSTBASE_URL!,
    process.env.NEXT_PUBLIC_POSTBASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(c => res.cookies.set(c.name, c.value, c.options as any)),
      },
    }
  )

  await postbase.auth.getSession() // refreshes token if needed
  return res
}
```

**Client Component:**

```typescript
'use client'
import { createBrowserClient } from 'postbasejs/ssr'

const postbase = createBrowserClient(
  process.env.NEXT_PUBLIC_POSTBASE_URL!,
  process.env.NEXT_PUBLIC_POSTBASE_ANON_KEY!
)
```

---

## TypeScript

The SDK is fully typed. Pass your row type as a generic for full IntelliSense:

```typescript
interface Post {
  id: string
  title: string
  status: 'draft' | 'published'
  created_at: string
}

const { data } = await postbase.from<Post>('posts').select('*').eq('status', 'published')
// data is Post[] | null
```

---

## Row Level Security (RLS)

When a user is signed in, their session JWT is automatically forwarded with every query. Your RLS policies can reference the user via:

```sql
current_setting('postbase.user_id', true)  -- the authenticated user's ID
current_setting('postbase.role', true)     -- the user's role
```

Example policy — users can only read their own rows:

```sql
CREATE POLICY "own rows" ON posts
  FOR SELECT USING (
    user_id = current_setting('postbase.user_id', true)::uuid
  );
```

---

## Environment Variables

We recommend storing your Postbase credentials in environment variables:

```bash
NEXT_PUBLIC_POSTBASE_URL=https://your-postbase-instance.com
NEXT_PUBLIC_POSTBASE_ANON_KEY=pb_anon_...
```

Use your **service role key** (`pb_service_...`) only in server-side code — it bypasses RLS.

---

## License

MIT — see [LICENSE](https://github.com/postbase/postbase/blob/main/LICENSE).

---

Built with love by the [Postbase](https://www.getpostbase.com) team.
