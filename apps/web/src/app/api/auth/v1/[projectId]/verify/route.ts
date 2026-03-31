/**
 * GET /api/auth/v1/[projectId]/verify
 *
 * Verify a magic link token. Called when user clicks the email link.
 * Query params: token, email, redirectTo?
 *
 * On success: redirects to redirectTo (or /) with session set in cookie.
 */
import { NextRequest } from "next/server";
import { signJwt, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, getJwtSecret } from "@/lib/auth/jwt";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const redirectTo = searchParams.get("redirectTo") ?? "/";

  if (!token || !email) {
    return Response.json({ error: "Missing token or email" }, { status: 400 });
  }

  const schema = getProjectSchema(projectId);
  const pool = getProjectPool();
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);
    await client.query(`SET search_path TO "${schema}", public`);

    const now = new Date();
    const { rows: [vt] } = await client.query(
      `SELECT * FROM "${schema}"."verification_tokens"
       WHERE "identifier" = $1 AND "token" = $2 AND "expires" > $3
       LIMIT 1`,
      [email, token, now]
    );

    if (!vt) return Response.json({ error: "Invalid or expired token" }, { status: 400 });

    await client.query(
      `DELETE FROM "${schema}"."verification_tokens" WHERE "identifier" = $1 AND "token" = $2`,
      [email, token]
    );

    const { rows: [user] } = await client.query(
      `SELECT * FROM "${schema}"."users" WHERE "email" = $1 LIMIT 1`,
      [email]
    );
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    await client.query(
      `UPDATE "${schema}"."users" SET "email_verified" = $1 WHERE "id" = $2 AND "email_verified" IS NULL`,
      [now, user.id]
    );

    const secret = getJwtSecret();
    const refreshExpiresAt = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL;

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

    const response = Response.redirect(new URL(redirectTo, req.url));
    const cookieOpts = [
      `postbase-session=${refreshToken}`,
      "HttpOnly",
      "Path=/",
      "SameSite=Lax",
      `Max-Age=${REFRESH_TOKEN_TTL}`,
      ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
    ].join("; ");

    response.headers.set("Set-Cookie", cookieOpts);
    return response;
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, token } = body;
  
  if (!email || !token) {
    return Response.json({ error: "Missing email or token" }, { status: 400 });
  }

  const schema = getProjectSchema(projectId);
  const pool = getProjectPool();
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);
    await client.query(`SET search_path TO "${schema}", public`);

    const now = new Date();
    const { rows: [vt] } = await client.query(
      `SELECT * FROM "${schema}"."verification_tokens"
       WHERE "identifier" = $1 AND "token" = $2 AND "expires" > $3
       LIMIT 1`,
      [email, token, now]
    );

    if (!vt) return Response.json({ error: "Invalid or expired token" }, { status: 400 });

    await client.query(
      `DELETE FROM "${schema}"."verification_tokens" WHERE "identifier" = $1 AND "token" = $2`,
      [email, token]
    );

    const { rows: [user] } = await client.query(
      `SELECT * FROM "${schema}"."users" WHERE "email" = $1 LIMIT 1`,
      [email]
    );
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    await client.query(
      `UPDATE "${schema}"."users" SET "email_verified" = $1 WHERE "id" = $2 AND "email_verified" IS NULL`,
      [now, user.id]
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
      metadata: user.metadata,
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
