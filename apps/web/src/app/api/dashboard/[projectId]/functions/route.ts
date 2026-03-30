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

// GET /api/dashboard/[projectId]/functions — list all functions in project schema
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
         p.proname AS function_name,
         pg_get_function_identity_arguments(p.oid) AS argument_types,
         pg_get_function_result(p.oid) AS return_type,
         l.lanname AS language,
         CASE p.provolatile
           WHEN 'i' THEN 'IMMUTABLE'
           WHEN 's' THEN 'STABLE'
           WHEN 'v' THEN 'VOLATILE'
         END AS volatility,
         CASE p.prosecdef
           WHEN true THEN 'SECURITY DEFINER'
           ELSE 'SECURITY INVOKER'
         END AS security,
         p.prosrc AS definition
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       JOIN pg_language l ON l.oid = p.prolang
       WHERE n.nspname = $1
         AND l.lanname IN ('sql', 'plpgsql')
       ORDER BY p.proname`,
      [schema]
    );

    return NextResponse.json({ functions: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// POST /api/dashboard/[projectId]/functions — create a new function
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { name, args, returnType, language, body, volatility, security } = await req.json() as {
    name: string;
    args: string;
    returnType: string;
    language: string;
    body: string;
    volatility?: string;
    security?: string;
  };

  if (!name || !returnType || !language || !body) {
    return NextResponse.json({ error: "name, returnType, language, and body are required" }, { status: 400 });
  }

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const vol = volatility || "VOLATILE";
    const sec = security || "SECURITY INVOKER";
    const argList = args || "";

    await client.query(
      `CREATE OR REPLACE FUNCTION "${schema}"."${name}"(${argList})
       RETURNS ${returnType}
       LANGUAGE ${language}
       ${vol}
       ${sec}
       AS $fn$
${body}
$fn$`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// PATCH /api/dashboard/[projectId]/functions — update (drop + recreate)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { originalName, originalArgs, name, args, returnType, language, body, volatility, security } = await req.json() as {
    originalName: string;
    originalArgs: string;
    name: string;
    args: string;
    returnType: string;
    language: string;
    body: string;
    volatility?: string;
    security?: string;
  };

  if (!originalName || !name || !returnType || !language || !body) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const vol = volatility || "VOLATILE";
    const sec = security || "SECURITY INVOKER";

    // Drop old function if name or args changed
    if (originalName !== name || originalArgs !== (args || "")) {
      await client.query(
        `DROP FUNCTION IF EXISTS "${schema}"."${originalName}"(${originalArgs})`
      );
    }

    await client.query(
      `CREATE OR REPLACE FUNCTION "${schema}"."${name}"(${args || ""})
       RETURNS ${returnType}
       LANGUAGE ${language}
       ${vol}
       ${sec}
       AS $fn$
${body}
$fn$`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE /api/dashboard/[projectId]/functions — drop a function
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { name, args } = await req.json() as { name: string; args: string };

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    await client.query(
      `DROP FUNCTION IF EXISTS "${schema}"."${name}"(${args || ""})`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
