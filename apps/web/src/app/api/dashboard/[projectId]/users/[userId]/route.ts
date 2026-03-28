/**
 * PATCH /api/dashboard/[projectId]/users/[userId] — update user metadata (custom fields only)
 *
 * This endpoint only allows writing to metadata keys. Fundamental auth fields
 * (email, passwordHash, emailVerified, etc.) are not writable here.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const patchSchema = z.object({
  metadata: z.record(z.unknown()),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; userId: string }> }
) {
  const { projectId, userId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const [user] = await db
    .update(users)
    .set({ metadata: parsed.data.metadata, updatedAt: new Date() })
    .where(and(eq(users.id, userId), eq(users.projectId, projectId)))
    .returning();

  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      metadata: (user.metadata ?? {}) as Record<string, unknown>,
      updatedAt: user.updatedAt.toISOString(),
    },
  });
}
