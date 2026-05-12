/**
 * Next.js instrumentation — runs once when the server process starts.
 * Used to normalize environment variables before any request is handled.
 */
export async function register() {
  // Normalize NEXTAUTH_URL / AUTH_URL to always include a protocol.
  // Railway (and some other hosts) set these to bare hostnames without a
  // scheme, which causes `new URL(...)` to throw "Invalid URL" at runtime.
  function normalizeUrl(raw: string | undefined): string | undefined {
    if (!raw) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }

  if (process.env.NEXTAUTH_URL) {
    process.env.NEXTAUTH_URL = normalizeUrl(process.env.NEXTAUTH_URL)!;
  }
  if (process.env.AUTH_URL) {
    process.env.AUTH_URL = normalizeUrl(process.env.AUTH_URL)!;
  }

  // NextAuth v5 reads AUTH_URL; v4 used NEXTAUTH_URL. Ensure both are set so
  // signOut() redirects to the right host regardless of which is configured.
  if (process.env.NEXTAUTH_URL && !process.env.AUTH_URL) {
    process.env.AUTH_URL = process.env.NEXTAUTH_URL;
  } else if (process.env.AUTH_URL && !process.env.NEXTAUTH_URL) {
    process.env.NEXTAUTH_URL = process.env.AUTH_URL;
  }

  // Only start the scheduler in the Node.js runtime (not edge), and only once.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadAllJobs } = await import("@/lib/scheduler");
    await loadAllJobs();
  }
}
