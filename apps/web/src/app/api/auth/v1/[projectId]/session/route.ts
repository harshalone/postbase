/**
 * @swagger
 * /api/auth/v1/{projectId}/session:
 *   get:
 *     summary: Get current session
 *     tags: [Auth]
 *     description: Validate a session token and return the current session.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         description: The project ID
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Postbase-Session
 *         required: false
 *         description: Refresh token
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Postbase-Token
 *         required: false
 *         description: Access JWT
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Returns session or null
 *   patch:
 *     summary: Update remember-me state for the current session
 *     tags: [Auth]
 *     description: >
 *       Re-issues the caller's refresh token with an extended (or shortened) TTL based on
 *       remember_me, independent of how the session was originally created (password, OTP,
 *       magic link, or OAuth). Useful for a "remember me" checkbox surfaced after sign-in,
 *       or for OAuth flows where remember_me can't be passed in a request body up front.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token, remember_me]
 *             properties:
 *               refresh_token:
 *                 type: string
 *               remember_me:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Returns the updated session with a re-issued refresh token
 *       400:
 *         description: Invalid JSON or request body
 *       401:
 *         description: Missing or invalid API key, or invalid/expired refresh token
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey } from "@/lib/auth/keys";
import { verifyJwt, signJwt, ACCESS_TOKEN_TTL, getRefreshTokenTTL, getJwtSecret } from "@/lib/auth/jwt";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return Response.json({ session: null });

  const keyInfo = await validateApiKey(authHeader.slice(7), projectId);
  if (!keyInfo) return Response.json({ session: null });

  const secret = getJwtSecret();
  const schema = getProjectSchema(keyInfo.projectId);
  const pool = getProjectPool();
  const client = await pool.connect();

  try {
    await ensureProjectAuthTables(client, schema);

    const sessionToken = req.headers.get("x-postbase-session");
    if (sessionToken) {
      const payload = await verifyJwt(sessionToken, secret);
      if (!payload || payload.pid !== keyInfo.projectId) return Response.json({ session: null });

      const { rows: [session] } = await client.query(
        `SELECT * FROM "${schema}"."sessions" WHERE "session_token" = $1 LIMIT 1`,
        [sessionToken]
      );
      if (!session) return Response.json({ session: null });

      const { rows: [user] } = await client.query(
        `SELECT * FROM "${schema}"."users" WHERE "id" = $1 LIMIT 1`,
        [payload.sub]
      );
      if (!user || user.banned_at) return Response.json({ session: null });

      const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL;
      const accessToken = await signJwt(
        { sub: user.id, pid: keyInfo.projectId, email: user.email, exp: expiresAt },
        secret
      );

      const userOut = {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        emailVerified: !!user.email_verified,
        metadata: user.metadata,
      };

      return Response.json({
        session: { accessToken, refreshToken: sessionToken, expiresAt, user: userOut },
      });
    }

    const token = req.headers.get("x-postbase-token");
    if (token) {
      const payload = await verifyJwt(token, secret);
      if (!payload || payload.pid !== keyInfo.projectId) return Response.json({ session: null });

      const { rows: [user] } = await client.query(
        `SELECT * FROM "${schema}"."users" WHERE "id" = $1 LIMIT 1`,
        [payload.sub]
      );
      if (!user || user.banned_at) return Response.json({ session: null });

      const userOut = {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        emailVerified: !!user.email_verified,
        metadata: user.metadata,
      };

      return Response.json({
        session: { accessToken: token, expiresAt: payload.exp, user: userOut },
      });
    }

    return Response.json({ session: null });
  } finally {
    client.release();
  }
}

const patchSchema = z.object({
  refresh_token: z.string(),
  remember_me: z.boolean(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const { refresh_token, remember_me } = parsed.data;

  const secret = getJwtSecret();
  const schema = getProjectSchema(keyInfo.projectId);
  const pool = getProjectPool();
  const client = await pool.connect();

  try {
    await ensureProjectAuthTables(client, schema);

    const payload = await verifyJwt(refresh_token, secret);
    if (!payload || payload.pid !== keyInfo.projectId) {
      return Response.json({ error: "Invalid or expired refresh token" }, { status: 401 });
    }

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
    const refreshExpiresAt = Math.floor(Date.now() / 1000) + getRefreshTokenTTL(remember_me);

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
       SET "session_token" = $1, "expires" = $2, "remember_me" = $3
       WHERE "id" = $4`,
      [newRefreshToken, new Date(refreshExpiresAt * 1000), remember_me, session.id]
    );

    const userOut = {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: !!user.email_verified,
      metadata: user.metadata,
    };

    return Response.json({
      session: { accessToken, refreshToken: newRefreshToken, expiresAt, user: userOut },
    });
  } finally {
    client.release();
  }
}
