/**
 * GET  /api/dashboard/projects/[projectId]/user-columns
 *   Returns custom columns on the per-project users table (from information_schema).
 *
 * POST /api/dashboard/projects/[projectId]/user-columns
 *   Adds a real column to the per-project users table via ALTER TABLE ADD COLUMN.
 *
 * DELETE /api/dashboard/projects/[projectId]/user-columns/[key]
 *   Drops a column from the per-project users table via ALTER TABLE DROP COLUMN.
 *   (DELETE is handled in a separate [key]/route.ts)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";

// Columns that are always present — never shown as custom columns
const LOCKED_COLUMNS = new Set([
  "id", "name", "email", "email_verified", "image", "password_hash",
  "phone", "phone_verified", "is_anonymous", "metadata", "banned_at",
  "created_at", "updated_at",
]);

// Map postgres data_type → UserColumnDef type for the UI
function pgTypeToColType(dataType: string, udtName: string): "text" | "number" | "boolean" | "date" {
  if (["integer", "smallint", "bigint", "numeric", "real", "double precision"].includes(dataType)) return "number";
  if (dataType === "boolean") return "boolean";
  if (["date", "time", "time with time zone", "timestamp without time zone", "timestamp with time zone"].includes(dataType)) return "date";
  return "text";
}

// Map UI rawType → real postgres DDL type
function rawTypeToPg(rawType: string): string {
  const map: Record<string, string> = {
    text: "text",
    varchar: "varchar",
    uuid: "uuid",
    int2: "smallint",
    int4: "integer",
    int8: "bigint",
    float4: "real",
    float8: "double precision",
    numeric: "numeric",
    bool: "boolean",
    json: "json",
    jsonb: "jsonb",
    date: "date",
    time: "time",
    timetz: "time with time zone",
    timestamp: "timestamp",
    timestamptz: "timestamptz",
    bytea: "bytea",
  };
  return map[rawType] ?? "text";
}

async function getProject(projectId: string) {
  const [project] = await db
    .select({ databaseUrl: projects.databaseUrl })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const schema = getProjectSchema(projectId);
  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);

    const { rows } = await client.query(
      `SELECT column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'users'
       ORDER BY ordinal_position`,
      [schema]
    );

    const columns = rows
      .filter((r) => !LOCKED_COLUMNS.has(r.column_name))
      .map((r) => ({
        key: r.column_name,
        label: r.column_name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
        type: pgTypeToColType(r.data_type, r.udt_name),
        rawType: r.udt_name,
        nullable: r.is_nullable === "YES",
        default: r.column_default,
      }));

    return Response.json({ columns });
  } finally {
    client.release();
  }
}

const addColumnSchema = z.object({
  key: z.string().min(1).max(64).regex(/^[a-z_][a-z0-9_]*$/, "Key must be snake_case"),
  label: z.string().min(1).max(64),
  rawType: z.string().min(1),
  defaultValue: z.string().optional(),
  nullable: z.boolean().optional().default(true),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = addColumnSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { key, rawType, defaultValue, nullable } = parsed.data;

  if (LOCKED_COLUMNS.has(key)) {
    return Response.json({ error: `"${key}" is a reserved column name` }, { status: 400 });
  }

  const pgType = rawTypeToPg(rawType);
  const schema = getProjectSchema(projectId);
  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);

    // Build DDL — column name is validated by regex above, safe to interpolate
    let ddl = `ALTER TABLE "${schema}"."users" ADD COLUMN IF NOT EXISTS "${key}" ${pgType}`;
    if (defaultValue?.trim()) ddl += ` DEFAULT ${defaultValue}`;
    if (!nullable) ddl += ` NOT NULL`;

    await client.query(ddl);

    return Response.json({ ok: true, key });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
