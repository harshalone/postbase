/**
 * GET /api/auth/v1/[projectId]/user
 *
 * Get the currently authenticated user (server-verified via JWT).
 * Token provided via X-Postbase-Token header.
 *
 * PATCH /api/auth/v1/[projectId]/user
 * Update the current user's profile.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";
import { verifyJwt, getJwtSecret } from "@/lib/auth/jwt";

async function resolveUser(req: NextRequest, projectId: string) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { keyInfo: null, userId: null };

  const keyInfo = await validateApiKey(authHeader.slice(7), projectId);
  if (!keyInfo) return { keyInfo: null, userId: null };

  const token = req.headers.get("x-postbase-token");
  if (!token) return { keyInfo, userId: null };

  const secret = getJwtSecret();
  const payload = await verifyJwt(token, secret);
  if (!payload || payload.pid !== keyInfo.projectId) return { keyInfo, userId: null };

  return { keyInfo, userId: payload.sub };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { keyInfo, userId } = await resolveUser(req, projectId);
  if (!keyInfo) return Response.json({ error: "Missing API key" }, { status: 401 });
  if (!userId) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: !!user.emailVerified,
      phone: user.phone,
      metadata: user.metadata,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
  });
}

const updateSchema = z.object({
  name: z.string().optional(),
  image: z.string().url().optional(),
  data: z.record(z.unknown()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { keyInfo, userId } = await resolveUser(req, projectId);
  if (!keyInfo) return Response.json({ error: "Missing API key" }, { status: 401 });
  if (!userId) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.image !== undefined) updates.image = parsed.data.image;
  if (parsed.data.data !== undefined) updates.metadata = parsed.data.data;

  const [user] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning();

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: !!user.emailVerified,
      phone: user.phone,
      metadata: user.metadata,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
  });
}
