/**
 * POST /api/auth/v1/[projectId]/email-otp/verify
 *
 * Verify a 6-digit email OTP code and return session tokens.
 * Requires: Authorization: Bearer <anon-key>
 * Body: { email, code }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey } from "@/lib/auth/keys";
import { signJwt, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, getJwtSecret } from "@/lib/auth/jwt";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";
import { nanoid } from "nanoid";

const bodySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

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
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, code } = parsed.data;

  const schema = getProjectSchema(keyInfo.projectId);
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
      [email, code, now]
    );

    if (!vt) return Response.json({ error: "Invalid or expired code" }, { status: 400 });

    await client.query(
      `DELETE FROM "${schema}"."verification_tokens" WHERE "identifier" = $1 AND "token" = $2`,
      [email, code]
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
  } finally {
    client.release();
  }
}
