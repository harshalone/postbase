import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, ensureProjectSchema } from "@/lib/project-db";

async function getProject(projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project ?? null;
}

// GET /api/dashboard/[projectId]/triggers — list all triggers in project schema
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
    const { rows } = await client.query(
      `SELECT
         t.tgname AS trigger_name,
         c.relname AS table_name,
         CASE
           WHEN t.tgtype::int & 2 = 2 THEN 'BEFORE'
           WHEN t.tgtype::int & 64 = 64 THEN 'INSTEAD OF'
           ELSE 'AFTER'
         END AS timing,
         array_remove(ARRAY[
           CASE WHEN t.tgtype::int & 4 = 4 THEN 'INSERT' END,
           CASE WHEN t.tgtype::int & 8 = 8 THEN 'DELETE' END,
           CASE WHEN t.tgtype::int & 16 = 16 THEN 'UPDATE' END,
           CASE WHEN t.tgtype::int & 32 = 32 THEN 'TRUNCATE' END
         ], NULL) AS events,
         CASE WHEN t.tgtype::int & 1 = 1 THEN 'ROW' ELSE 'STATEMENT' END AS orientation,
         pn.nspname AS function_schema,
         p.proname AS function_name,
         t.tgenabled != 'D' AS enabled
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_proc p ON p.oid = t.tgfoid
       JOIN pg_namespace pn ON pn.oid = p.pronamespace
       WHERE n.nspname = $1
         AND NOT t.tgisinternal
       ORDER BY t.tgname`,
      [schema]
    );

    return NextResponse.json({ triggers: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// POST /api/dashboard/[projectId]/triggers — create a new trigger
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { name, tableName, timing, events, orientation, functionName, functionSchema } = await req.json() as {
    name: string;
    tableName: string;
    timing: string;
    events: string[];
    orientation: string;
    functionName: string;
    functionSchema?: string;
  };

  if (!name || !tableName || !timing || !events?.length || !functionName) {
    return NextResponse.json({ error: "name, tableName, timing, events, and functionName are required" }, { status: 400 });
  }

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const fnSchema = functionSchema || schema;
    const eventList = events.join(" OR ");
    const orient = orientation || "STATEMENT";

    await client.query(
      `CREATE TRIGGER "${name}"
       ${timing} ${eventList}
       ON "${schema}"."${tableName}"
       FOR EACH ${orient}
       EXECUTE FUNCTION "${fnSchema}"."${functionName}"()`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// PATCH /api/dashboard/[projectId]/triggers — update (drop + recreate)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { originalName, originalTable, name, tableName, timing, events, orientation, functionName, functionSchema } = await req.json() as {
    originalName: string;
    originalTable: string;
    name: string;
    tableName: string;
    timing: string;
    events: string[];
    orientation: string;
    functionName: string;
    functionSchema?: string;
  };

  if (!originalName || !originalTable || !name || !tableName || !timing || !events?.length || !functionName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const fnSchema = functionSchema || schema;
    const eventList = events.join(" OR ");
    const orient = orientation || "STATEMENT";

    // Drop old trigger
    await client.query(
      `DROP TRIGGER IF EXISTS "${originalName}" ON "${schema}"."${originalTable}"`
    );

    // Create new trigger
    await client.query(
      `CREATE TRIGGER "${name}"
       ${timing} ${eventList}
       ON "${schema}"."${tableName}"
       FOR EACH ${orient}
       EXECUTE FUNCTION "${fnSchema}"."${functionName}"()`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE /api/dashboard/[projectId]/triggers — drop a trigger
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { name, tableName } = await req.json() as { name: string; tableName: string };

  if (!name || !tableName) {
    return NextResponse.json({ error: "name and tableName are required" }, { status: 400 });
  }

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    await client.query(
      `DROP TRIGGER IF EXISTS "${name}" ON "${schema}"."${tableName}"`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
