/**
 * POST /api/auth/v1/signup
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
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";
import { signJwt, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, getJwtSecret } from "@/lib/auth/jwt";
import { nanoid } from "nanoid";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  data: z.record(z.unknown()).optional(),
});

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
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, password, data: metadata } = parsed.data;

  // Check if user already exists in this project
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.projectId, keyInfo.projectId), eq(users.email, email)))
    .limit(1);

  if (existing) {
    return Response.json({ error: "User already registered" }, { status: 422 });
  }

  const passwordHash = await hash(password, 12);
  const now = new Date();

  const [user] = await db
    .insert(users)
    .values({
      projectId: keyInfo.projectId,
      email,
      passwordHash,
      metadata: metadata ?? {},
      emailVerified: null,
    })
    .returning();

  const secret = getJwtSecret();
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

  // Store session
  const sessionExpires = new Date(refreshExpiresAt * 1000);
  await db.insert(sessions).values({
    userId: user.id,
    projectId: keyInfo.projectId,
    sessionToken: refreshToken,
    expires: sessionExpires,
  });

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
    session: {
      accessToken,
      refreshToken,
      expiresAt,
      user: userOut,
    },
  });
}
