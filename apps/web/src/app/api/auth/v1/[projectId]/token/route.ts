/**
 * POST /api/auth/v1/[projectId]/token
 *
 * Exchange credentials or refresh token for a session.
 *
 * grant_type=password:       { email, password }
 * grant_type=refresh_token:  { refresh_token }
 *
 * Requires: Authorization: Bearer <anon-key>
 */
import { NextRequest } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { validateApiKey } from "@/lib/auth/keys";
import { signJwt, verifyJwt, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, getJwtSecret } from "@/lib/auth/jwt";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";
import { nanoid } from "nanoid";

const passwordSchema = z.object({
  grant_type: z.literal("password"),
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string(),
});

const bodySchema = z.discriminatedUnion("grant_type", [passwordSchema, refreshSchema]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }
  const keyInfo = await validateApiKey(authHeader.slice(7), projectId);
  if (!keyInfo) return Response.json({ error: "Invalid API key" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const secret = getJwtSecret();
  const schema = getProjectSchema(keyInfo.projectId);
  const pool = getProjectPool();
  const client = await pool.connect();

  try {
    await ensureProjectAuthTables(client, schema);

    if (parsed.data.grant_type === "password") {
      const { email, password } = parsed.data;

      const { rows: [user] } = await client.query(
        `SELECT * FROM "${schema}"."users" WHERE "email" = $1 LIMIT 1`,
        [email]
      );

      if (!user || !user.password_hash) {
        return Response.json({ error: "Invalid email or password" }, { status: 400 });
      }
      if (user.banned_at) {
        return Response.json({ error: "Account is banned" }, { status: 403 });
      }

      const valid = await compare(password, user.password_hash);
      if (!valid) return Response.json({ error: "Invalid email or password" }, { status: 400 });

      const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL;
      const refreshExpiresAt = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL;

      const accessToken = await signJwt(
        { sub: user.id, pid: keyInfo.projectId, email: user.email, exp: expiresAt },
        secret
      );
      const refreshToken = await signJwt(
        { sub: user.id, pid: keyInfo.projectId, email: user.email, exp: refreshExpiresAt, jti: nanoid() },
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
    }

    // grant_type=refresh_token
    const { refresh_token } = parsed.data;

    const payload = await verifyJwt(refresh_token, secret);
    if (!payload) return Response.json({ error: "Invalid or expired refresh token" }, { status: 401 });

    const { rows: [session] } = await client.query(
      `SELECT * FROM "${schema}"."sessions" WHERE "session_token" = $1 LIMIT 1`,
      [refresh_token]
    );
    if (!session) return Response.json({ error: "Session not found" }, { status: 401 });

    const { rows: [user] } = await client.query(
      `SELECT * FROM "${schema}"."users" WHERE "id" = $1 LIMIT 1`,
      [payload.sub]
    );
    if (!user || user.banned_at) return Response.json({ error: "User not found or banned" }, { status: 401 });

    const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL;
    const refreshExpiresAt = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL;

    const accessToken = await signJwt(
      { sub: user.id, pid: keyInfo.projectId, email: user.email, exp: expiresAt },
      secret
    );
    const newRefreshToken = await signJwt(
      { sub: user.id, pid: keyInfo.projectId, email: user.email, exp: refreshExpiresAt, jti: nanoid() },
      secret
    );

    await client.query(
      `UPDATE "${schema}"."sessions"
       SET "session_token" = $1, "expires" = $2
       WHERE "id" = $3`,
      [newRefreshToken, new Date(refreshExpiresAt * 1000), session.id]
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
      session: { accessToken, refreshToken: newRefreshToken, expiresAt, user: userOut },
    });
  } finally {
    client.release();
  }
}
