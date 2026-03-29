import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, getProjectSchema, ensureProjectSchema } from "@/lib/project-db";

async function getProject(projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project ?? null;
}

// GET /api/dashboard/[projectId]/tables — list all tables + column info
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const { rows: tables } = await client.query<{
      table_name: string;
      row_estimate: string;
      size_bytes: string;
    }>(
      `SELECT
         t.table_name,
         COALESCE(s.n_live_tup, 0)::text AS row_estimate,
         COALESCE(pg_total_relation_size(
           quote_ident($1) || '.' || quote_ident(t.table_name)
         ), 0)::text AS size_bytes
       FROM information_schema.tables t
       LEFT JOIN pg_stat_user_tables s
         ON s.schemaname = $1 AND s.relname = t.table_name
       WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
       ORDER BY t.table_name`,
      [schema]
    );

    // For each table fetch column definitions
    const tablesWithCols = await Promise.all(
      tables.map(async (t) => {
        const { rows: cols } = await client.query(
          `SELECT
             column_name,
             data_type,
             udt_name,
             is_nullable,
             column_default
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          [schema, t.table_name]
        );
        return { ...t, columns: cols };
      })
    );

    return NextResponse.json({ tables: tablesWithCols });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// POST /api/dashboard/[projectId]/tables — create a new table
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { name, columns } = await req.json() as {
    name: string;
    columns: Array<{ name: string; type: string; nullable: boolean; default?: string; primaryKey?: boolean }>;
  };

  if (!name || !columns?.length) {
    return NextResponse.json({ error: "name and columns are required" }, { status: 400 });
  }

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);

    const colDefs = columns.map((c) => {
      const parts = [`"${c.name}"`, c.type];
      if (c.primaryKey) parts.push("PRIMARY KEY");
      if (!c.nullable && !c.primaryKey) parts.push("NOT NULL");
      if (c.default) parts.push(`DEFAULT ${c.default}`);
      return parts.join(" ");
    });

    await client.query(
      `CREATE TABLE "${schema}"."${name}" (${colDefs.join(", ")})`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
