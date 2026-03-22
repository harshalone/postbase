/**
 * GET   /api/auth/v1/admin/users/[id]   — get user by id
 * PATCH /api/auth/v1/admin/users/[id]   — update user
 * DELETE /api/auth/v1/admin/users/[id]  — delete user
 *
 * All require service role key.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";

async function requireServiceRole(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const keyInfo = await validateApiKey(authHeader.slice(7));
  if (!keyInfo || keyInfo.type !== "service_role") return null;
  return keyInfo;
}

function formatUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    emailVerified: !!user.emailVerified,
    phone: user.phone,
    metadata: user.metadata,
    bannedAt: user.bannedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const keyInfo = await requireServiceRole(req);
  if (!keyInfo) return Response.json({ error: "Service role key required" }, { status: 403 });

  const { id } = await params;
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.projectId, keyInfo.projectId)))
    .limit(1);

  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  return Response.json({ user: formatUser(user) });
}

const updateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  user_metadata: z.record(z.unknown()).optional(),
  ban: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const keyInfo = await requireServiceRole(req);
  if (!keyInfo) return Response.json({ error: "Service role key required" }, { status: 403 });

  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.email !== undefined) updates.email = parsed.data.email;
  if (parsed.data.password !== undefined) updates.passwordHash = await hash(parsed.data.password, 12);
  if (parsed.data.user_metadata !== undefined) updates.metadata = parsed.data.user_metadata;
  if (parsed.data.ban === true) updates.bannedAt = new Date();
  if (parsed.data.ban === false) updates.bannedAt = null;

  const [user] = await db
    .update(users)
    .set(updates)
    .where(and(eq(users.id, id), eq(users.projectId, keyInfo.projectId)))
    .returning();

  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  return Response.json({ user: formatUser(user) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const keyInfo = await requireServiceRole(req);
  if (!keyInfo) return Response.json({ error: "Service role key required" }, { status: 403 });

  const { id } = await params;

  // Delete sessions first (cascade handles the rest)
  await db.delete(sessions).where(eq(sessions.userId, id));

  const [deleted] = await db
    .delete(users)
    .where(and(eq(users.id, id), eq(users.projectId, keyInfo.projectId)))
    .returning({ id: users.id });

  if (!deleted) return Response.json({ error: "User not found" }, { status: 404 });
  return Response.json({ message: "User deleted" });
}
