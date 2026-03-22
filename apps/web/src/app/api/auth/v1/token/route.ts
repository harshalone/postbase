/**
 * POST /api/auth/v1/token
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
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";
import { signJwt, verifyJwt, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, getJwtSecret } from "@/lib/auth/jwt";
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

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }
  const keyInfo = await validateApiKey(authHeader.slice(7));
  if (!keyInfo) return Response.json({ error: "Invalid API key" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const secret = getJwtSecret();

  if (parsed.data.grant_type === "password") {
    const { email, password } = parsed.data;

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.projectId, keyInfo.projectId), eq(users.email, email)))
      .limit(1);

    if (!user || !user.passwordHash) {
      return Response.json({ error: "Invalid email or password" }, { status: 400 });
    }

    if (user.bannedAt) {
      return Response.json({ error: "Account is banned" }, { status: 403 });
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      return Response.json({ error: "Invalid email or password" }, { status: 400 });
    }

    const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL;
    const refreshExpiresAt = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL;

    const accessToken = await signJwt(
      { sub: user.id, pid: keyInfo.projectId, email: user.email!, exp: expiresAt },
      secret
    );
    const refreshToken = await signJwt(
      { sub: user.id, pid: keyInfo.projectId, email: user.email!, exp: refreshExpiresAt, jti: nanoid() },
      secret
    );

    // Upsert session
    await db.insert(sessions).values({
      userId: user.id,
      projectId: keyInfo.projectId,
      sessionToken: refreshToken,
      expires: new Date(refreshExpiresAt * 1000),
    }).onConflictDoNothing();

    const userOut = {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: !!user.emailVerified,
      metadata: user.metadata,
      createdAt: user.createdAt.toISOString(),
    };

    return Response.json({
      user: userOut,
      session: { accessToken, refreshToken, expiresAt, user: userOut },
    });
  }

  // grant_type=refresh_token
  const { refresh_token } = parsed.data;

  const payload = await verifyJwt(refresh_token, secret);
  if (!payload) {
    return Response.json({ error: "Invalid or expired refresh token" }, { status: 401 });
  }

  // Verify session still exists in DB
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.sessionToken, refresh_token), eq(sessions.projectId, keyInfo.projectId)))
    .limit(1);

  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 401 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!user || user.bannedAt) {
    return Response.json({ error: "User not found or banned" }, { status: 401 });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL;
  const refreshExpiresAt = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL;

  const accessToken = await signJwt(
    { sub: user.id, pid: keyInfo.projectId, email: user.email!, exp: expiresAt },
    secret
  );
  const newRefreshToken = await signJwt(
    { sub: user.id, pid: keyInfo.projectId, email: user.email!, exp: refreshExpiresAt, jti: nanoid() },
    secret
  );

  // Rotate refresh token
  await db
    .update(sessions)
    .set({ sessionToken: newRefreshToken, expires: new Date(refreshExpiresAt * 1000) })
    .where(eq(sessions.id, session.id));

  const userOut = {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    emailVerified: !!user.emailVerified,
    metadata: user.metadata,
    createdAt: user.createdAt.toISOString(),
  };

  return Response.json({
    user: userOut,
    session: { accessToken, refreshToken: newRefreshToken, expiresAt, user: userOut },
  });
}
