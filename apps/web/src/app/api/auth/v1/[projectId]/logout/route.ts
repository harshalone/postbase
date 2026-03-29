/**
 * POST /api/auth/v1/[projectId]/logout
 *
 * Invalidate the current session (delete refresh token from DB).
 * Requires: Authorization: Bearer <anon-key>
 * Optional: X-Postbase-Token: <access-jwt> to identify the session.
 */
import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth/keys";
import { verifyJwt, getJwtSecret } from "@/lib/auth/jwt";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }
  const keyInfo = await validateApiKey(authHeader.slice(7), projectId);
  if (!keyInfo) return Response.json({ error: "Invalid API key" }, { status: 401 });

  const token = req.headers.get("x-postbase-token");
  if (token) {
    const secret = getJwtSecret();
    const payload = await verifyJwt(token, secret);
    if (payload && payload.pid === keyInfo.projectId) {
      const schema = getProjectSchema(keyInfo.projectId);
      const pool = getProjectPool();
      const client = await pool.connect();
      try {
        await ensureProjectAuthTables(client, schema);
        await client.query(
          `DELETE FROM "${schema}"."sessions" WHERE "user_id" = $1`,
          [payload.sub]
        );
      } finally {
        client.release();
      }
    }
  }

  return Response.json({ message: "Logged out" });
}
