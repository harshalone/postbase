/**
 * OAuth 2.0 Callback endpoint (PKCE flow).
 * URL: GET /api/auth/v1/{projectId}/oauth/callback/{provider}
 *
 * The upstream OAuth provider (e.g. GitHub) redirects here after the user
 * approves the authorization. We:
 *   1. Extract the authorization code + state from query params
 *   2. Decode the redirect_to URL from state
 *   3. Exchange the code for an access token with the provider
 *   4. Fetch the user profile from the provider
 *   5. Upsert the user in the project's DB schema
 *   6. Issue a postbase session (access + refresh JWT)
 *   7. Redirect back to the customer app with the session in the URL fragment
 *      e.g. redirect_to#access_token=...&refresh_token=...
 *
 * PKCE note: the code_verifier is NOT sent here — the client (postbasejs) will
 * call the /token endpoint separately to exchange the code. However since we
 * own both the client and server, we do the exchange here directly and pass
 * the resulting session tokens to the client via the redirect URL fragment.
 */
import { type NextRequest } from "next/server";
import { getEnabledProviders } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getBaseUrl } from "@/lib/get-base-url";
import { signJwt, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, getJwtSecret } from "@/lib/auth/jwt";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";
import { nanoid } from "nanoid";

// Provider token exchange configs
interface ProviderTokenConfig {
  tokenUrl: string;
  userUrl: string;
  mapUser: (profile: Record<string, unknown>) => { id: string; email: string; name?: string; image?: string };
}

const PROVIDER_CONFIGS: Record<string, ProviderTokenConfig> = {
  github: {
    tokenUrl: "https://github.com/login/oauth/access_token",
    userUrl: "https://api.github.com/user",
    mapUser: (p) => ({
      id: String(p.id),
      email: String(p.email ?? ""),
      name: p.name ? String(p.name) : undefined,
      image: p.avatar_url ? String(p.avatar_url) : undefined,
    }),
  },
  google: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    userUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    mapUser: (p) => ({
      id: String(p.id),
      email: String(p.email ?? ""),
      name: p.name ? String(p.name) : undefined,
      image: p.picture ? String(p.picture) : undefined,
    }),
  },
  discord: {
    tokenUrl: "https://discord.com/api/oauth2/token",
    userUrl: "https://discord.com/api/users/@me",
    mapUser: (p) => ({
      id: String(p.id),
      email: String(p.email ?? ""),
      name: p.username ? String(p.username) : undefined,
      image: p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png` : undefined,
    }),
  },
  gitlab: {
    tokenUrl: "https://gitlab.com/oauth/token",
    userUrl: "https://gitlab.com/api/v4/user",
    mapUser: (p) => ({
      id: String(p.id),
      email: String(p.email ?? ""),
      name: p.name ? String(p.name) : undefined,
      image: p.avatar_url ? String(p.avatar_url) : undefined,
    }),
  },
  spotify: {
    tokenUrl: "https://accounts.spotify.com/api/token",
    userUrl: "https://api.spotify.com/v1/me",
    mapUser: (p) => ({
      id: String(p.id),
      email: String(p.email ?? ""),
      name: p.display_name ? String(p.display_name) : undefined,
      image: Array.isArray(p.images) && p.images.length > 0 ? String((p.images[0] as Record<string, unknown>).url) : undefined,
    }),
  },
};

function redirectWithError(redirectTo: string, error: string): Response {
  const fallback = `${getBaseUrl()}/auth/error?error=${encodeURIComponent(error)}`;
  const target = redirectTo || fallback;
  const url = new URL(target.includes("://") ? target : `${getBaseUrl()}${target}`);
  url.searchParams.set("error", error);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; provider: string }> }
) {
  const { projectId, provider } = await context.params;
  const { searchParams } = req.nextUrl;

  const code = searchParams.get("code");
  const fullState = searchParams.get("state") ?? "";
  const oauthError = searchParams.get("error");

  console.log(`[oauth/callback/${provider}] START projectId=${projectId} code=${code ? "present" : "missing"} oauthError=${oauthError}`);

  // Split state into random part + encoded redirect_to
  const [, encodedRedirectTo] = fullState.split("|");
  const redirectTo = encodedRedirectTo
    ? Buffer.from(encodedRedirectTo, "base64url").toString()
    : "";

  console.log(`[oauth/callback/${provider}] redirectTo=${redirectTo}`);

  try {

  if (oauthError) {
    console.log(`[oauth/callback/${provider}] oauthError=${oauthError}`);
    return redirectWithError(redirectTo, oauthError);
  }

  if (!code) {
    console.log(`[oauth/callback/${provider}] missing code`);
    return redirectWithError(redirectTo, "missing_code");
  }

  // Validate project
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    console.log(`[oauth/callback/${provider}] project not found`);
    return redirectWithError(redirectTo, "project_not_found");
  }
  console.log(`[oauth/callback/${provider}] project found, databaseUrl=${project.databaseUrl ? "set" : "missing"}`);

  // Get provider config
  const enabledProviders = await getEnabledProviders(projectId);
  const providerConfig = enabledProviders.find((p) => p.provider === provider);

  if (!providerConfig?.clientId || !providerConfig?.clientSecret) {
    console.log(`[oauth/callback/${provider}] provider not configured`);
    return redirectWithError(redirectTo, "provider_not_configured");
  }

  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    console.log(`[oauth/callback/${provider}] unsupported provider`);
    return redirectWithError(redirectTo, "unsupported_provider");
  }

  // Exchange authorization code for access token
  const callbackUrl = `${getBaseUrl()}/api/auth/v1/${projectId}/oauth/callback/${provider}`;
  console.log(`[oauth/callback/${provider}] exchanging code for token, callbackUrl=${callbackUrl}`);
  const tokenRes = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.log(`[oauth/callback/${provider}] token exchange failed status=${tokenRes.status} body=${body}`);
    return redirectWithError(redirectTo, "token_exchange_failed");
  }

  const tokenData = await tokenRes.json() as Record<string, unknown>;
  const accessToken = String(tokenData.access_token ?? "");
  console.log(`[oauth/callback/${provider}] accessToken=${accessToken ? "present" : "missing"}`);
  if (!accessToken) {
    return redirectWithError(redirectTo, "no_access_token");
  }

  // Fetch user profile from provider
  const userRes = await fetch(config.userUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  if (!userRes.ok) {
    console.log(`[oauth/callback/${provider}] profile fetch failed status=${userRes.status}`);
    return redirectWithError(redirectTo, "profile_fetch_failed");
  }

  const profile = await userRes.json() as Record<string, unknown>;
  const mapped = config.mapUser(profile);
  console.log(`[oauth/callback/${provider}] profile mapped id=${mapped.id} email=${mapped.email}`);

  // GitHub may not include email in profile — fetch separately
  let email = mapped.email;
  if (!email && provider === "github") {
    console.log(`[oauth/callback/${provider}] fetching github emails separately`);
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (emailsRes.ok) {
      const emails = await emailsRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
      const primary = emails.find((e) => e.primary && e.verified);
      email = primary?.email ?? emails[0]?.email ?? "";
      console.log(`[oauth/callback/${provider}] github email resolved=${email}`);
    }
  }

  if (!email) {
    console.log(`[oauth/callback/${provider}] no email from provider`);
    return redirectWithError(redirectTo, "no_email_from_provider");
  }

  // Upsert user in the project's DB schema
  const pool = getProjectPool(project.databaseUrl);
  const schema = getProjectSchema(projectId);
  const client = await pool.connect();
  console.log(`[oauth/callback/${provider}] connected to project DB schema=${schema}`);

  try {
    await ensureProjectAuthTables(client, schema);
    console.log(`[oauth/callback/${provider}] tables ensured, upserting user email=${email}`);

    // Upsert user by email
    const { rows: [user] } = await client.query(
      `INSERT INTO "${schema}"."users" ("email", "name", "image", "email_verified")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT ("email") DO UPDATE
         SET "name"           = COALESCE(EXCLUDED."name", "${schema}"."users"."name"),
             "image"          = COALESCE(EXCLUDED."image", "${schema}"."users"."image"),
             "email_verified" = COALESCE("${schema}"."users"."email_verified", NOW()),
             "updated_at"     = NOW()
       RETURNING *`,
      [email, mapped.name ?? null, mapped.image ?? null]
    );
    console.log(`[oauth/callback/${provider}] user upserted id=${user?.id}`);

    // Upsert OAuth account link in accounts table
    await client.query(
      `INSERT INTO "${schema}"."accounts"
         ("user_id", "type", "provider", "provider_account_id")
       VALUES ($1, 'oauth', $2, $3)
       ON CONFLICT ("provider", "provider_account_id") DO NOTHING`,
      [user.id, provider, mapped.id]
    );
    console.log(`[oauth/callback/${provider}] account linked`);

    const secret = getJwtSecret();
    const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL;
    const refreshExpiresAt = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL;

    const postbaseAccessToken = await signJwt(
      { sub: user.id, pid: projectId, email: user.email, exp: expiresAt },
      secret
    );
    const refreshToken = await signJwt(
      { sub: user.id, pid: projectId, email: user.email, exp: refreshExpiresAt, jti: nanoid() },
      secret
    );

    await client.query(
      `INSERT INTO "${schema}"."sessions" ("session_token", "user_id", "expires")
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [refreshToken, user.id, new Date(refreshExpiresAt * 1000)]
    );

    // Redirect back to customer app with session tokens in URL fragment
    // postbasejs will parse these from the fragment and store the session
    const userOut = {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: !!user.email_verified,
      createdAt: user.created_at,
    };

    const target = redirectTo || getBaseUrl();
    const targetUrl = new URL(target.includes("://") ? target : `${getBaseUrl()}${target}`);

    // Pass session as query params (fragment not available server-side)
    targetUrl.searchParams.set("access_token", postbaseAccessToken);
    targetUrl.searchParams.set("refresh_token", refreshToken);
    targetUrl.searchParams.set("expires_at", String(expiresAt));
    targetUrl.searchParams.set("user", Buffer.from(JSON.stringify(userOut)).toString("base64url"));

    return new Response(null, {
      status: 302,
      headers: { location: targetUrl.toString() },
    });
  } finally {
      client.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[oauth/callback/${provider}]`, message);
    return redirectWithError(redirectTo, `server_error: ${message}`);
  }
}
