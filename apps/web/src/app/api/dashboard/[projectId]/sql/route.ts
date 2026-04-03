import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, ensureProjectSchema } from "@/lib/project-db";

/**
 * Rewrites CREATE [OR REPLACE] FUNCTION bodies to prepend
 *   SET search_path TO "<schema>", public;
 * so that trigger functions resolve unqualified table names correctly
 * when they fire on a different database connection.
 *
 * Handles both $$ and $LABEL$ dollar-quoted function bodies.
 * Only injects if the body doesn't already set search_path.
 */
function injectSearchPathIntoFunctions(sql: string, schema: string): string {
  // Match dollar-quoted body: $$...$$  or  $tag$...$tag$
  return sql.replace(
    /(\bCREATE\b(?:\s+OR\s+REPLACE)?\s+FUNCTION\b[\s\S]*?)(\$([^$]*)\$)([\s\S]*?)(\$\3\$)/gi,
    (match, before, openQuote, _tag, body, closeQuote) => {
      const searchPathLine = `SET search_path TO "${schema}", public;\n`;
      if (/SET\s+search_path/i.test(body)) return match; // already set
      // Inject after the first BEGIN (case-insensitive), or at the very start of the body
      const injected = /^\s*BEGIN\b/i.test(body.trimStart())
        ? body.replace(/(\bBEGIN\b\s*\n?)/i, `$1  ${searchPathLine}`)
        : searchPathLine + body;
      return `${before}${openQuote}${injected}${closeQuote}`;
    }
  );
}

// POST /api/dashboard/[projectId]/sql — execute arbitrary SQL in project schema
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { sql } = await req.json() as { sql: string };
  if (!sql?.trim()) return NextResponse.json({ error: "sql is required" }, { status: 400 });

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);

    // Inject SET search_path into trigger function bodies so that table references
    // inside BEGIN...END resolve correctly when the trigger fires on a different
    // connection (where search_path is back to default).
    const processedSql = injectSearchPathIntoFunctions(sql, schema);

    // Wrap in a transaction so SET LOCAL search_path is scoped to this query only.
    // This prevents the search_path from leaking to other requests on the same connection.
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    const result = await client.query(processedSql);
    await client.query("COMMIT");
    return NextResponse.json({
      rows: result.rows,
      fields: result.fields?.map((f) => ({ name: f.name })) ?? [],
      rowCount: result.rowCount,
      command: result.command,
      schema,
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    return NextResponse.json({ error: String(err) }, { status: 400 });
  } finally {
    client.release();
  }
}
