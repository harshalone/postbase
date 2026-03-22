/**
 * POST /api/auth/v1/logout
 *
 * Invalidate the current session (delete refresh token from DB).
 * Requires: Authorization: Bearer <anon-key>
 * Optional: X-Postbase-Token: <access-jwt> to identify the session.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";
import { verifyJwt, decodeJwtUnsafe, getJwtSecret } from "@/lib/auth/jwt";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }
  const keyInfo = await validateApiKey(authHeader.slice(7));
  if (!keyInfo) return Response.json({ error: "Invalid API key" }, { status: 401 });

  const token = req.headers.get("x-postbase-token");
  if (token) {
    const secret = getJwtSecret();
    const payload = await verifyJwt(token, secret);
    if (payload && payload.pid === keyInfo.projectId) {
      // Delete all sessions for this user in this project
      await db
        .delete(sessions)
        .where(and(eq(sessions.userId, payload.sub), eq(sessions.projectId, keyInfo.projectId)));
    }
  }

  return Response.json({ message: "Logged out" });
}
