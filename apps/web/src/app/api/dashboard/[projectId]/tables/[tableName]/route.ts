import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, getProjectSchema, ensureProjectSchema } from "@/lib/project-db";

async function getProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return project ?? null;
}

const FILTER_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is_null",
  "is_not_null",
] as const;
type FilterOperator = (typeof FILTER_OPERATORS)[number];

function isFilterOperator(value: string): value is FilterOperator {
  return (FILTER_OPERATORS as readonly string[]).includes(value);
}

// Build a WHERE clause fragment for a single column/operator/value filter.
// Column name is validated against the real column list before use, so it's safe to interpolate.
function buildColumnFilterClause(
  quotedCol: string,
  operator: FilterOperator,
  value: string,
  queryValues: unknown[]
): string {
  switch (operator) {
    case "is_null":
      return `${quotedCol} IS NULL`;
    case "is_not_null":
      return `${quotedCol} IS NOT NULL`;
    case "like":
      queryValues.push(`%${value}%`);
      return `${quotedCol}::text LIKE $${queryValues.length}`;
    case "ilike":
      queryValues.push(`%${value}%`);
      return `${quotedCol}::text ILIKE $${queryValues.length}`;
    case "eq":
      queryValues.push(value);
      return `${quotedCol}::text = $${queryValues.length}`;
    case "neq":
      queryValues.push(value);
      return `${quotedCol}::text != $${queryValues.length}`;
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const opMap: Record<string, string> = { gt: ">", gte: ">=", lt: "<", lte: "<=" };
      queryValues.push(value);
      return `${quotedCol} ${opMap[operator]} $${queryValues.length}`;
    }
  }
}

// GET /api/dashboard/[projectId]/tables/[tableName]?page=0&limit=50
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; tableName: string }> }
) {
  const { projectId, tableName } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 500);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const sortCol = url.searchParams.get("sortCol");
  const sortDir = url.searchParams.get("sortDir") === "desc" ? "DESC" : "ASC";
  const search = url.searchParams.get("search")?.trim() ?? "";
  const filterColumn = url.searchParams.get("filterColumn")?.trim() ?? "";
  const filterOperatorParam = url.searchParams.get("filterOperator")?.trim() ?? "";
  const filterValue = url.searchParams.get("filterValue") ?? "";

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);

    // Fetch column names for this table (used for search-all and to validate filterColumn)
    const { rows: cols } = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, tableName]
    );

    let whereClause = "";
    const queryValues: unknown[] = [];

    if (filterColumn && filterOperatorParam && isFilterOperator(filterOperatorParam)) {
      const col = cols.find((c) => c.column_name === filterColumn);
      if (!col) return NextResponse.json({ error: "Unknown column" }, { status: 400 });
      const requiresValue = filterOperatorParam !== "is_null" && filterOperatorParam !== "is_not_null";
      if (!requiresValue || filterValue !== "") {
        const clause = buildColumnFilterClause(`"${col.column_name}"`, filterOperatorParam, filterValue, queryValues);
        whereClause = ` WHERE ${clause}`;
      }
    } else if (search) {
      // Build WHERE clause for search: cast every column to text and ILIKE-match
      if (cols.length > 0) {
        const conditions = cols.map((c) => `"${c.column_name}"::text ILIKE $1`).join(" OR ");
        whereClause = ` WHERE (${conditions})`;
        queryValues.push(`%${search}%`);
      }
    }

    const orderClause = sortCol ? ` ORDER BY "${sortCol.replace(/"/g, "")}" ${sortDir}` : "";
    const dataValues = [...queryValues, limit, offset];
    const { rows } = await client.query(
      `SELECT * FROM "${schema}"."${tableName}"${whereClause}${orderClause} LIMIT $${queryValues.length + 1} OFFSET $${queryValues.length + 2}`,
      dataValues
    );
    const { rows: [{ count }] } = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${schema}"."${tableName}"${whereClause}`,
      queryValues
    );
    return NextResponse.json({ rows, total: count });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// POST /api/dashboard/[projectId]/tables/[tableName] — insert row
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; tableName: string }> }
) {
  const { projectId, tableName } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const row = await req.json() as Record<string, unknown>;
  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const keys = Object.keys(row);
    const vals = Object.values(row);
    const cols = keys.map((k) => `"${k}"`).join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const { rows: [inserted] } = await client.query(
      `INSERT INTO "${schema}"."${tableName}" (${cols}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    return NextResponse.json({ row: inserted });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// PATCH /api/dashboard/[projectId]/tables/[tableName] — update row
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; tableName: string }> }
) {
  const { projectId, tableName } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { where, set } = await req.json() as {
    where: Record<string, unknown>;
    set: Record<string, unknown>;
  };
  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const vals: unknown[] = [];
    const setClauses = Object.entries(set).map(([k, v]) => {
      vals.push(v);
      return `"${k}" = $${vals.length}`;
    });
    const whereClauses = Object.entries(where).map(([k, v]) => {
      vals.push(v);
      return `"${k}" = $${vals.length}`;
    });
    const { rows: [updated] } = await client.query(
      `UPDATE "${schema}"."${tableName}" SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")} RETURNING *`,
      vals
    );
    return NextResponse.json({ row: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE /api/dashboard/[projectId]/tables/[tableName] — delete row
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; tableName: string }> }
) {
  const { projectId, tableName } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { where } = await req.json() as { where: Record<string, unknown> };
  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const vals: unknown[] = [];
    const whereClauses = Object.entries(where).map(([k, v]) => {
      vals.push(v);
      return `"${k}" = $${vals.length}`;
    });
    await client.query(
      `DELETE FROM "${schema}"."${tableName}" WHERE ${whereClauses.join(" AND ")}`,
      vals
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
