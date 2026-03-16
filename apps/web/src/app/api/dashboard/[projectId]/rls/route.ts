import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, getProjectSchema, ensureProjectSchema } from "@/lib/project-db";

async function getProject(projectId: string) {
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return p ?? null;
}

// GET /api/dashboard/[projectId]/rls — list RLS policies + whether RLS is enabled per table
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

    const { rows: policies } = await client.query(
      `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
       FROM pg_policies WHERE schemaname = $1 ORDER BY tablename, policyname`,
      [schema]
    );

    const { rows: rlsTables } = await client.query(
      `SELECT relname AS tablename, relrowsecurity AS rls_enabled
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'r'
       ORDER BY relname`,
      [schema]
    );

    return NextResponse.json({ policies, rlsTables });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}

// POST /api/dashboard/[projectId]/rls — create/toggle RLS policy
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json() as {
    action: "enable_rls" | "disable_rls" | "create_policy" | "drop_policy";
    table: string;
    policyName?: string;
    cmd?: string; // SELECT, INSERT, UPDATE, DELETE, ALL
    using?: string;
    withCheck?: string;
    permissive?: boolean;
  };

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);

    if (body.action === "enable_rls") {
      await client.query(`ALTER TABLE "${schema}"."${body.table}" ENABLE ROW LEVEL SECURITY`);
    } else if (body.action === "disable_rls") {
      await client.query(`ALTER TABLE "${schema}"."${body.table}" DISABLE ROW LEVEL SECURITY`);
    } else if (body.action === "create_policy") {
      if (!body.policyName) return NextResponse.json({ error: "policyName required" }, { status: 400 });
      const permissive = body.permissive !== false ? "PERMISSIVE" : "RESTRICTIVE";
      const cmd = body.cmd ?? "ALL";
      const parts = [
        `CREATE POLICY "${body.policyName}" ON "${schema}"."${body.table}"`,
        `AS ${permissive}`,
        `FOR ${cmd}`,
      ];
      if (body.using) parts.push(`USING (${body.using})`);
      if (body.withCheck) parts.push(`WITH CHECK (${body.withCheck})`);
      await client.query(parts.join(" "));
    } else if (body.action === "drop_policy") {
      if (!body.policyName) return NextResponse.json({ error: "policyName required" }, { status: 400 });
      await client.query(`DROP POLICY IF EXISTS "${body.policyName}" ON "${schema}"."${body.table}"`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  } finally {
    client.release();
    await pool.end();
  }
}
