/**
 * Returns the base URL for the app, ensuring it always has a protocol.
 *
 * Railway (and some other hosts) set NEXTAUTH_URL / AUTH_URL to just the
 * hostname without a scheme. `new URL('example.com')` throws "Invalid URL",
 * so we normalise it here.
 */
export function getBaseUrl(): string {
  const raw =
    process.env.NEXTAUTH_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000";

  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, "");

  // No protocol — assume https in production, http otherwise
  const scheme =
    process.env.NODE_ENV === "production" ? "https" : "http";
  return `${scheme}://${raw.replace(/\/$/, "")}`;
}
