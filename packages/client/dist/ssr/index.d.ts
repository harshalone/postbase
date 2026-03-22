import { PostbaseClientOptions, CookieAdapter, PostbaseClient } from '../index.js';
export { AuthResponse, AuthUser, QueryResult, Session, SingleResult, createClient } from '../index.js';

/**
 * postbasejs/ssr
 *
 * SSR-compatible Postbase clients for server environments (Next.js App Router,
 * SvelteKit, Nuxt, etc.) that need to read/write cookies to forward the user's
 * session to the Postbase API so that RLS applies to the authenticated user —
 * not just the anonymous key role.
 *
 * Usage (Next.js App Router):
 *
 * // middleware.ts
 * import { createServerClient } from 'postbasejs/ssr'
 * import { NextResponse } from 'next/server'
 *
 * export async function middleware(req) {
 *   const res = NextResponse.next()
 *   const postbase = createServerClient(url, anonKey, {
 *     cookies: {
 *       getAll: () => req.cookies.getAll(),
 *       setAll: (cookies) => cookies.forEach(c => res.cookies.set(c.name, c.value, c.options)),
 *     }
 *   })
 *   await postbase.auth.getSession() // refreshes session if needed
 *   return res
 * }
 *
 * // Server Component
 * import { cookies } from 'next/headers'
 * const postbase = createServerClient(url, anonKey, {
 *   cookies: {
 *     getAll: () => cookieStore.getAll(),
 *     setAll: () => {},  // read-only in server components
 *   }
 * })
 * const { data } = await postbase.from('posts').select('*')
 */

interface ServerClientOptions extends Omit<PostbaseClientOptions, "cookies"> {
    cookies: CookieAdapter;
}
/**
 * Create a Postbase client for use in server-side environments.
 * Requires a cookie adapter so session cookies can be read and refreshed.
 *
 * The user's session JWT is forwarded with every query, so RLS policies
 * evaluate against the authenticated user rather than the anon role.
 */
declare function createServerClient(url: string, key: string, options: ServerClientOptions): PostbaseClient;
/**
 * Create a Postbase client for use in the browser.
 * Handles session persistence in localStorage and automatic token refresh.
 *
 * Use this in Client Components or plain browser JS.
 */
declare function createBrowserClient(url: string, key: string, options?: Omit<PostbaseClientOptions, "cookies">): PostbaseClient;

export { CookieAdapter, PostbaseClient, PostbaseClientOptions, type ServerClientOptions, createBrowserClient, createServerClient };
