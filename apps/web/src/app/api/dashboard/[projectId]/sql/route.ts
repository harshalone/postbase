import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { from as copyFrom } from "pg-copy-streams";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, ensureProjectSchema } from "@/lib/project-db";

// Allow large SQL file imports (pg_dump files can be hundreds of MB)
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Rewrites CREATE [OR REPLACE] FUNCTION bodies to prepend
 *   SET search_path TO "<schema>", public;
 * so that trigger functions resolve unqualified table names correctly
 * when they fire on a different database connection.
 */
function injectSearchPathIntoFunctions(sql: string, schema: string): string {
  return sql.replace(
    /(\bCREATE\b(?:\s+OR\s+REPLACE)?\s+FUNCTION\b[\s\S]*?)(\$([^$]*)\$)([\s\S]*?)(\$\3\$)/gi,
    (match, before, openQuote, _tag, body, closeQuote) => {
      const searchPathLine = `SET search_path TO "${schema}", public;\n`;
      if (/SET\s+search_path/i.test(body)) return match;
      const beginMatch = /\bBEGIN\b/i.exec(body);
      if (!beginMatch) return match;
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
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;

  while (i < sql.length) {
    if (sql[i] === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      if (end === -1) { current += sql.slice(i); i = sql.length; }
      else { current += sql.slice(i, end + 1); i = end + 1; }
      continue;
    }

    if (sql[i] === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) { current += sql.slice(i); i = sql.length; }
      else { current += sql.slice(i, end + 2); i = end + 2; }
      continue;
    }

    if (sql[i] === "$") {
      const tagMatch = /^\$([^$]*)\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const closeIdx = sql.indexOf(tag, i + tag.length);
        if (closeIdx !== -1) {
          current += sql.slice(i, closeIdx + tag.length);
          i = closeIdx + tag.length;
          continue;
        }
      }
    }

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

    if (sql[i] === ";") {
      current += ";";
      const trimmed = current.trim();
      if (trimmed && trimmed !== ";") statements.push(trimmed);
      current = "";
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

function requiresNoTransaction(stmt: string): boolean {
  const upper = stmt.trimStart().toUpperCase();
  return (
    /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/.test(upper) ||
    /^(BEGIN|COMMIT|ROLLBACK|END)\b/.test(upper)
  );
}

function isTransactionControl(stmt: string): boolean {
  return /^(BEGIN|COMMIT|ROLLBACK|END)\b/i.test(stmt.trim());
}

function overridesSearchPath(stmt: string): boolean {
  return /set_config\s*\(\s*'search_path'/i.test(stmt) ||
    /^\s*SET\s+search_path\b/i.test(stmt);
}

function isPgDumpNoise(stmt: string): boolean {
  const s = stmt.trim();
  if (/^CREATE\s+SCHEMA\b/i.test(s)) return true;
  if (/^COMMENT\s+ON\s+SCHEMA\b/i.test(s)) return true;
  if (/^SET\s+(statement_timeout|lock_timeout|idle_in_transaction|transaction_timeout|client_encoding|standard_conforming|check_function_bodies|xmloption|client_min_messages|row_security)\b/i.test(s)) return true;
  return false;
}

/**
 * A parsed chunk from a pg_dump file.
 * - "stmt": a regular semicolon-terminated SQL statement
 * - "copy": a COPY ... FROM stdin block with the header and raw data rows separated
 *
 * IMPORTANT: parseDumpChunks runs on the RAW sql before any schema rewriting so
 * that COPY data rows (user content) are never touched by string replacement.
 * Schema rewriting is applied per-chunk to stmt sql and copy headers only.
 */
type SqlChunk =
  | { kind: "stmt"; sql: string }
  | { kind: "copy"; header: string; dataRows: string };

function parseDumpChunks(sql: string): SqlChunk[] {
  const chunks: SqlChunk[] = [];
  const lines = sql.split("\n");
  let i = 0;
  let stmtLines: string[] = [];

  function flushStmts() {
    if (stmtLines.length === 0) return;
    const text = stmtLines.join("\n");
    stmtLines = [];
    for (const stmt of splitSqlStatements(text)) {
      chunks.push({ kind: "stmt", sql: stmt });
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // COPY tablename (...) FROM stdin;
    if (/^\s*COPY\s+\S.*\s+FROM\s+stdin\s*;?\s*$/i.test(line)) {
      flushStmts();
      const header = line.trim().endsWith(";") ? line.trim() : line.trim() + ";";
      i++;

      const dataLines: string[] = [];
      while (i < lines.length) {
        if (lines[i] === "\\.") { i++; break; }
        dataLines.push(lines[i]);
        i++;
      }
      // pg-copy-streams expects the data to end with a newline
      const dataRows = dataLines.join("\n") + (dataLines.length > 0 ? "\n" : "");
      chunks.push({ kind: "copy", header, dataRows });
      continue;
    }

    stmtLines.push(line);
    i++;
  }

  flushStmts();
  return chunks;
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

  let sql: string;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file field required for multipart upload" }, { status: 400 });
    }
    sql = await (file as File).text();
  } else {
    const body = await req.json() as { sql: string };
    sql = body.sql;
  }
  if (!sql?.trim()) return NextResponse.json({ error: "sql is required" }, { status: 400 });

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);

    // Parse BEFORE any rewriting — COPY data rows must never be modified.
    const chunks = parseDumpChunks(sql);

    await client.query(`SET search_path TO "${schema}", public`);

    let lastResult: { rows: Record<string, unknown>[]; fields: { name: string }[]; rowCount: number | null; command: string } = {
      rows: [], fields: [], rowCount: null, command: "OK",
    };

    for (const chunk of chunks) {
      if (chunk.kind === "stmt") {
        // Rewrite schema + inject search_path only on SQL statements (safe — no user data)
        const rewritten = chunk.sql.replace(/\bpublic\./gi, `"${schema}".`);
        const stmt = injectSearchPathIntoFunctions(rewritten, schema);

        if (isTransactionControl(stmt)) continue;
        if (overridesSearchPath(stmt)) continue;
        if (isPgDumpNoise(stmt)) continue;

        if (requiresNoTransaction(stmt)) {
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
      } else {
        // COPY block: rewrite schema only in the header (SQL), never in data rows (user content)
        const header = chunk.header.replace(/\bpublic\./gi, `"${schema}".`);
        await new Promise<void>((resolve, reject) => {
          const copyStream = client.query(copyFrom(header));
          const source = Readable.from([Buffer.from(chunk.dataRows, "utf8")]);
          source.on("error", reject);
          copyStream.on("error", reject);
          copyStream.on("finish", resolve);
          source.pipe(copyStream);
        });
        lastResult = { rows: [], fields: [], rowCount: null, command: "COPY" };
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
    try { await client.query("SET search_path TO DEFAULT"); } catch { /* ignore */ }
    client.release();
  }
}
