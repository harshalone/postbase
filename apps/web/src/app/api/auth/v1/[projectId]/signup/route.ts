/**
 * POST /api/auth/v1/[projectId]/signup
 *
 * Sign up a new user with email + password.
 * Requires: Authorization: Bearer <anon-key>
 *
 * Body: { email, password, data?: Record<string,unknown> }
 * Returns: { user, session }
 */
import { NextRequest } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { validateApiKey } from "@/lib/auth/keys";
import { signJwt, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, getJwtSecret } from "@/lib/auth/jwt";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";
import { nanoid } from "nanoid";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  data: z.record(z.unknown()).optional(),
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
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, password, data: metadata } = parsed.data;

  const schema = getProjectSchema(keyInfo.projectId);
  const pool = getProjectPool();
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);

    const { rows: [existing] } = await client.query(
      `SELECT id FROM "${schema}"."users" WHERE "email" = $1 LIMIT 1`,
      [email]
    );
    if (existing) {
      return Response.json({ error: "User already registered" }, { status: 422 });
    }

    const passwordHash = await hash(password, 12);

    const { rows: [user] } = await client.query(
      `INSERT INTO "${schema}"."users" ("email", "password_hash", "metadata")
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email, passwordHash, JSON.stringify(metadata ?? {})]
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
    await pool.end();
  }
}
