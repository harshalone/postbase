/**
 * GET /api/auth/v1/[projectId]/verify
 *
 * Verify a magic link token. Called when user clicks the email link.
 * Query params: token, email, redirectTo?
 *
 * On success: redirects to redirectTo (or /) with session set in cookie.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users, sessions, verificationTokens } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { signJwt, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, getJwtSecret } from "@/lib/auth/jwt";
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

  const now = new Date();
  const [vt] = await db
    .select()
    .from(verificationTokens)
    .where(and(
      eq(verificationTokens.identifier, email),
      eq(verificationTokens.token, token),
      gt(verificationTokens.expires, now)
    ))
    .limit(1);

  if (!vt) {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  await db
    .delete(verificationTokens)
    .where(and(eq(verificationTokens.identifier, email), eq(verificationTokens.token, token)));

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.projectId, projectId)))
    .limit(1);

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  if (!user.emailVerified) {
    await db.update(users).set({ emailVerified: now }).where(eq(users.id, user.id));
  }

  const secret = getJwtSecret();
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL;
  const refreshExpiresAt = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL;

  const accessToken = await signJwt(
    { sub: user.id, pid: user.projectId, email: user.email!, exp: expiresAt },
    secret
  );
  const refreshToken = await signJwt(
    { sub: user.id, pid: user.projectId, email: user.email!, exp: refreshExpiresAt, jti: nanoid() },
    secret
  );

  await db.insert(sessions).values({
    userId: user.id,
    projectId: user.projectId,
    sessionToken: refreshToken,
    expires: new Date(refreshExpiresAt * 1000),
  }).onConflictDoNothing();

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
}
