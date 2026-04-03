/**
 * Cross-origin OAuth initiation endpoint.
 * URL: /api/auth/{projectId}/oauth/{provider}?callbackUrl=...
 *
 * Because NextAuth's CSRF cookie can't be shared cross-origin, postbasejs
 * redirects the user's browser here (same-origin to postbase) and we
 * internally trigger the NextAuth sign-in via a server-side fetch, then
 * redirect the user to the GitHub authorization URL.
 */
import { type NextRequest } from "next/server";
import { buildAuthConfig, getEnabledProviders } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Auth, createActionURL } from "@auth/core";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; provider: string }> }
) {
  const { projectId, provider } = await context.params;
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") ?? "/";

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const enabledProviders = await getEnabledProviders(projectId);
  const config = await buildAuthConfig(projectId, enabledProviders);

  // Build a synthetic POST request to NextAuth's signin action
  const basePath = `/api/auth/${projectId}`;
  const signinUrl = new URL(`${basePath}/signin/${provider}`, req.url);

  // Fetch CSRF token from NextAuth internally (same-origin, no cross-site issues)
  const csrfUrl = new URL(`${basePath}/csrf`, req.url);
  const csrfRes = await Auth(
    new Request(csrfUrl.toString(), { method: "GET", headers: req.headers }),
    config
  );
  const { csrfToken } = await csrfRes.json() as { csrfToken: string };

  // Get the csrf cookie set by the above response
  const csrfCookie = csrfRes.headers.get("set-cookie") ?? "";

  // POST to NextAuth signin with the CSRF token
  const body = new URLSearchParams({ csrfToken, callbackUrl });
  const signinRes = await Auth(
    new Request(signinUrl.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        // Forward the csrf cookie so NextAuth can validate it
        cookie: csrfCookie.split(";")[0],
      },
      body: body.toString(),
    }),
    config
  );

  // NextAuth returns a redirect to the OAuth provider — forward it to the browser
  const location = signinRes.headers.get("location");
  if (!location) {
    return new Response("Failed to initiate OAuth", { status: 500 });
  }

  // Forward all set-cookie headers from both responses so the session cookie is set
  const headers = new Headers();
  headers.set("location", location);
  for (const [key, value] of csrfRes.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") headers.append("set-cookie", value);
  }
  for (const [key, value] of signinRes.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") headers.append("set-cookie", value);
  }

  return new Response(null, { status: 302, headers });
}
