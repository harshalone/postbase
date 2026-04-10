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

      // Only inject into plpgsql functions (sql-language functions use the session search_path).
      // For plpgsql, SET must be inside BEGIN...END — find the first BEGIN and inject after it.
      // This handles both "BEGIN\n..." and "DECLARE\n...\nBEGIN\n..." patterns.
      const beginMatch = /\bBEGIN\b/i.exec(body);
      if (!beginMatch) return match; // no BEGIN found (sql-language or unusual), skip injection

      const injected =
        body.slice(0, beginMatch.index + beginMatch[0].length) +
        "\n  " + searchPathLine +
        body.slice(beginMatch.index + beginMatch[0].length);

      return `${before}${openQuote}${injected}${closeQuote}`;
    }
  );
}

/**
 * Split a SQL string into individual statements, respecting:
 * - Dollar-quoted strings ($$...$$ or $tag$...$tag$)
 * - Single-quoted strings
 * - Line comments (--)
 * - Block comments (/* ... *\/)
 *
 * Returns non-empty, trimmed statements only.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;

  while (i < sql.length) {
    // Line comment: skip to end of line
    if (sql[i] === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      if (end === -1) { current += sql.slice(i); i = sql.length; }
      else { current += sql.slice(i, end + 1); i = end + 1; }
      continue;
    }

    // Block comment: skip /* ... */
    if (sql[i] === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) { current += sql.slice(i); i = sql.length; }
      else { current += sql.slice(i, end + 2); i = end + 2; }
      continue;
    }

    // Dollar-quoted string: $$...$$ or $tag$...$tag$
    if (sql[i] === "$") {
      const tagMatch = /^\$([^$]*)\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0]; // e.g. $$ or $BODY$
        const closeIdx = sql.indexOf(tag, i + tag.length);
        if (closeIdx !== -1) {
          current += sql.slice(i, closeIdx + tag.length);
          i = closeIdx + tag.length;
          continue;
        }
      }
    }

    // Single-quoted string: '...' (handle '' escapes)
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j++; break; }
        j++;
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    // Statement separator
    if (sql[i] === ";") {
      current += ";";
      const trimmed = current.trim();
      if (trimmed && trimmed !== ";") {
        statements.push(trimmed);
      }
      current = "";
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  // Trailing statement without semicolon
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
}

/** Returns true for statements that must run outside a transaction block in Postgres */
function requiresNoTransaction(stmt: string): boolean {
  const upper = stmt.trimStart().toUpperCase();
  // CREATE INDEX CONCURRENTLY and CREATE/DROP DATABASE cannot run inside transactions.
  // Also skip bare transaction control keywords.
  return (
    /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/.test(upper) ||
    /^(BEGIN|COMMIT|ROLLBACK|END)\b/.test(upper)
  );
}

/** Returns true for bare transaction-control statements we should skip (we handle txn ourselves) */
function isTransactionControl(stmt: string): boolean {
  return /^(BEGIN|COMMIT|ROLLBACK|END)\b/i.test(stmt.trim());
}

/**
 * Returns true for statements that override the search_path we set.
 * pg_dump exports include:
 *   SELECT pg_catalog.set_config('search_path', '', false);
 * which resets search_path to empty, causing unqualified names to fail.
 * We skip these so our session-level SET search_path stays in effect.
 */
function overridesSearchPath(stmt: string): boolean {
  return /set_config\s*\(\s*'search_path'/i.test(stmt) ||
    /^\s*SET\s+search_path\b/i.test(stmt);
}

/**
 * Returns true for pg_dump housekeeping statements that are irrelevant or
 * harmful in an import context (schema creation for public, comments on public, etc.)
 */
function isPgDumpNoise(stmt: string): boolean {
  const s = stmt.trim();
  // CREATE SCHEMA public / CREATE SCHEMA IF NOT EXISTS public — already handled
  if (/^CREATE\s+SCHEMA\b/i.test(s)) return true;
  // COMMENT ON SCHEMA ... — not needed
  if (/^COMMENT\s+ON\s+SCHEMA\b/i.test(s)) return true;
  // SET client_encoding, SET row_security, etc — session settings from pg_dump header
  if (/^SET\s+(statement_timeout|lock_timeout|idle_in_transaction|transaction_timeout|client_encoding|standard_conforming|check_function_bodies|xmloption|client_min_messages|row_security)\b/i.test(s)) return true;
  return false;
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

    // Rewrite any explicit "public." schema prefix to the project schema so that
    // pg_dump exports (which hardcode public.tablename everywhere) land in the
    // right schema automatically. Users shouldn't need to know about proj_uuid.
    const reschemaedSql = sql.replace(/\bpublic\./gi, `"${schema}".`);

    // Inject SET search_path into trigger function bodies so that table references
    // inside BEGIN...END resolve correctly when the trigger fires on a different
    // connection (where search_path is back to default).
    const processedSql = injectSearchPathIntoFunctions(reschemaedSql, schema);

    const statements = splitSqlStatements(processedSql);

    // Set session-level search_path so it persists across multiple statements
    // (SET LOCAL is transaction-scoped and resets after COMMIT).
    await client.query(`SET search_path TO "${schema}", public`);

    let lastResult: { rows: Record<string, unknown>[]; fields: { name: string }[]; rowCount: number | null; command: string } = {
      rows: [], fields: [], rowCount: null, command: "OK",
    };

    for (const stmt of statements) {
      // Skip bare transaction-control keywords — we manage the transaction ourselves.
      if (isTransactionControl(stmt)) continue;
      // Skip any set_config('search_path', ...) or SET search_path — pg_dump exports
      // include these to reset search_path to empty, which would break unqualified names.
      if (overridesSearchPath(stmt)) continue;
      // Skip pg_dump header noise (CREATE SCHEMA public, COMMENT ON SCHEMA, session SETs).
      if (isPgDumpNoise(stmt)) continue;

      if (requiresNoTransaction(stmt)) {
        // Must run outside a transaction (e.g. CREATE INDEX CONCURRENTLY)
        const r = await client.query(stmt);
        lastResult = {
          rows: r.rows ?? [],
          fields: r.fields?.map((f) => ({ name: f.name })) ?? [],
          rowCount: r.rowCount,
          command: r.command,
        };
      } else {
        await client.query("BEGIN");
        try {
          const r = await client.query(stmt);
          await client.query("COMMIT");
          lastResult = {
            rows: r.rows ?? [],
            fields: r.fields?.map((f) => ({ name: f.name })) ?? [],
            rowCount: r.rowCount,
            command: r.command,
          };
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }
    }

    return NextResponse.json({
      rows: lastResult.rows,
      fields: lastResult.fields,
      rowCount: lastResult.rowCount,
      command: lastResult.command,
      schema,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  } finally {
    // Restore default search_path before returning connection to pool
    try { await client.query("SET search_path TO DEFAULT"); } catch { /* ignore */ }
    client.release();
  }
}
