/**
 * GET /api/auth/v1/[projectId]/session
 *
 * Validate a session token and return the current session.
 * Accepts X-Postbase-Session header (refresh token) or X-Postbase-Token (JWT).
 */
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth/keys";
import { verifyJwt, signJwt, ACCESS_TOKEN_TTL, getJwtSecret } from "@/lib/auth/jwt";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";

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
