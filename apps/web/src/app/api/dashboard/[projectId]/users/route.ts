/**
 * GET /api/dashboard/[projectId]/users — list users for the dashboard (session-authed)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const [project] = await db
    .select({ databaseUrl: projects.databaseUrl })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") ?? "50", 10)));
  const offset = (page - 1) * perPage;

  const schema = getProjectSchema(projectId);
  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);

    const { rows: [{ total }] } = await client.query(
      `SELECT COUNT(*)::int AS total FROM "${schema}"."users"`
    );
    const { rows } = await client.query(
      `SELECT u.*,
              COALESCE(
                json_agg(a.provider ORDER BY a.provider) FILTER (WHERE a.provider IS NOT NULL),
                '[]'
              ) AS providers
       FROM "${schema}"."users" u
       LEFT JOIN "${schema}"."accounts" a ON a.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at
       LIMIT $1 OFFSET $2`,
      [perPage, offset]
    );

    const users = rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      image: u.image,
      emailVerified: !!u.email_verified,
      phone: u.phone,
      isAnonymous: u.is_anonymous,
      bannedAt: u.banned_at ? new Date(u.banned_at).toISOString() : null,
      metadata: u.metadata ?? {},
      providers: u.providers as string[],
      createdAt: new Date(u.created_at).toISOString(),
      updatedAt: new Date(u.updated_at).toISOString(),
    }));

    return Response.json({ users, total, page, perPage });
  } finally {
    client.release();
  }
}
