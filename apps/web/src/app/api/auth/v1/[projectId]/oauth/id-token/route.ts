/**
 * Native OAuth id_token exchange endpoint.
 * URL: POST /api/auth/v1/{projectId}/oauth/id-token
 *
 * For native apps (iOS, macOS, Android) that obtain an id_token directly
 * from the provider's native SDK (Apple Sign In, Google Sign In). The app
 * sends the token here; we validate it against the provider's public keys
 * and return a postbase session — no browser redirect needed.
 *
 * Supported providers: apple, google
 *
 * Body:
 *   provider  - "apple" | "google"
 *   id_token  - JWT issued by the provider
 *   nonce     - (optional) nonce used when requesting the id_token; required
 *               if you passed one to the native SDK to prevent replay attacks
 */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { validateApiKey } from "@/lib/auth/keys";
import { getEnabledProviders } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { signJwt, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, getJwtSecret } from "@/lib/auth/jwt";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";
import { nanoid } from "nanoid";

const bodySchema = z.object({
  provider: z.enum(["apple", "google"]),
  id_token: z.string().min(1),
  nonce: z.string().optional(),
});

// Apple and Google JWKS endpoints for public key verification
const JWKS_URLS: Record<string, string> = {
  apple: "https://appleid.apple.com/auth/keys",
  google: "https://www.googleapis.com/oauth2/v3/certs",
};

// Expected issuer per provider
const ISSUERS: Record<string, string> = {
  apple: "https://appleid.apple.com",
  google: "https://accounts.google.com",
};

// Cache JWKS sets so we don't re-fetch on every request
const jwksSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(provider: string) {
  if (!jwksSets.has(provider)) {
    jwksSets.set(provider, createRemoteJWKSet(new URL(JWKS_URLS[provider])));
  }
  return jwksSets.get(provider)!;
}

interface AppleClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  nonce?: string;
  aud: string | string[];
}

interface GoogleClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  nonce?: string;
  aud: string | string[];
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;

  // Require API key
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }
  const keyInfo = await validateApiKey(authHeader.slice(7), projectId);
  if (!keyInfo) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { provider, id_token, nonce } = parsed.data;

  // Validate project
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Validate provider is enabled and get client credentials
  const enabledProviders = await getEnabledProviders(projectId);
  const providerConfig = enabledProviders.find((p) => p.provider === provider);

  if (!providerConfig?.clientId) {
    return Response.json(
      { error: `Provider '${provider}' is not enabled for this project` },
      { status: 400 }
    );
  }

  // Verify the id_token using the provider's public keys
  let claims: AppleClaims | GoogleClaims;
  try {
    const jwks = getJwks(provider);
    const { payload } = await jwtVerify(id_token, jwks, {
      issuer: ISSUERS[provider],
      // audience must match one of the client IDs configured for the project.
      // Apple uses the Service ID (web) or Bundle ID (native) as the audience.
      // Google uses the OAuth client ID.
      // We accept any of the comma-separated clientIds stored in the config.
      audience: providerConfig.clientId.split(",").map((s) => s.trim()),
    });
    claims = payload as unknown as AppleClaims | GoogleClaims;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `id_token verification failed: ${msg}` }, { status: 401 });
  }

  // Verify nonce if provided
  if (nonce && claims.nonce !== nonce) {
    return Response.json({ error: "nonce mismatch" }, { status: 401 });
  }

  const providerUserId = claims.sub;
  const email = claims.email ?? "";

  if (!email) {
    return Response.json({ error: "no_email_from_provider" }, { status: 400 });
  }

  const name = provider === "google" ? (claims as GoogleClaims).name : undefined;
  const image = provider === "google" ? (claims as GoogleClaims).picture : undefined;

  // Upsert user + issue session
  const pool = getProjectPool(project.databaseUrl);
  const schema = getProjectSchema(projectId);
  const client = await pool.connect();

  try {
    await ensureProjectAuthTables(client, schema);

    const { rows: [user] } = await client.query(
      `INSERT INTO "${schema}"."users" ("email", "name", "image", "email_verified")
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT ("email") DO UPDATE
         SET "name"           = COALESCE(EXCLUDED."name", "${schema}"."users"."name"),
             "image"          = COALESCE(EXCLUDED."image", "${schema}"."users"."image"),
             "email_verified" = COALESCE("${schema}"."users"."email_verified", NOW()),
             "updated_at"     = NOW()
       RETURNING *`,
      [email, name ?? null, image ?? null]
    );

    await client.query(
      `INSERT INTO "${schema}"."accounts"
         ("user_id", "type", "provider", "provider_account_id")
       VALUES ($1, 'oauth', $2, $3)
       ON CONFLICT ("provider", "provider_account_id") DO NOTHING`,
      [user.id, provider, providerUserId]
    );

    const secret = getJwtSecret();
    const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL;
    const refreshExpiresAt = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL;

    const accessToken = await signJwt(
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

    const userOut = {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: !!user.email_verified,
      createdAt: user.created_at,
    };

    return Response.json({
      user: userOut,
      session: { accessToken, refreshToken, expiresAt, user: userOut },
    });
  } finally {
    client.release();
  }
}
