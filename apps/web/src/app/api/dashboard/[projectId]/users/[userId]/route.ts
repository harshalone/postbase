/**
 * PATCH /api/dashboard/[projectId]/users/[userId] — update user metadata (custom fields only)
 *
 * This endpoint only allows writing to metadata keys. Fundamental auth fields
 * (email, passwordHash, emailVerified, etc.) are not writable here.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";

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

  const [project] = await db
    .select({ databaseUrl: projects.databaseUrl })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const schema = getProjectSchema(projectId);
  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);

    const { rows: [user] } = await client.query(
      `UPDATE "${schema}"."users"
       SET "metadata" = $1, "updated_at" = now()
       WHERE "id" = $2
       RETURNING id, email, metadata, updated_at`,
      [JSON.stringify(parsed.data.metadata), userId]
    );

    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        metadata: user.metadata ?? {},
        updatedAt: new Date(user.updated_at).toISOString(),
      },
    });
  } finally {
    client.release();
    await pool.end();
  }
}
