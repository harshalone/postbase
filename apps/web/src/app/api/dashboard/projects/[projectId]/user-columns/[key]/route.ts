/**
 * DELETE /api/dashboard/projects/[projectId]/user-columns/[key]
 *   Drops a custom column from the per-project users table.
 *   Irreversible — all data in the column is lost.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";

const LOCKED_COLUMNS = new Set([
  "id", "name", "email", "email_verified", "image", "password_hash",
  "phone", "phone_verified", "is_anonymous", "metadata", "banned_at",
  "created_at", "updated_at",
]);

// key is validated as snake_case before use in DDL
const SAFE_KEY = /^[a-z_][a-z0-9_]*$/;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; key: string }> }
) {
  const { projectId, key } = await params;

  if (!SAFE_KEY.test(key)) {
    return Response.json({ error: "Invalid column name" }, { status: 400 });
  }
  if (LOCKED_COLUMNS.has(key)) {
    return Response.json({ error: `"${key}" is a locked column and cannot be deleted` }, { status: 400 });
  }

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

    // key is validated by regex above — safe to interpolate with double-quoting
    await client.query(
      `ALTER TABLE "${schema}"."users" DROP COLUMN IF EXISTS "${key}"`
    );

    return Response.json({ ok: true, key });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
