/**
 * Database query API
 * POST /api/db/query
 *
 * Headers:
 *   Authorization: Bearer <anon-key | service-role-key>
 *   Content-Type: application/json
 *
 * Body:
 *   { table: string, operation: 'select'|'insert'|'update'|'delete', ... }
 *
 * anon key   → enforces RLS (row level security via session user)
 * service key → bypasses RLS, full access
 */
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { validateApiKey } from "@/lib/auth/keys";
import { z } from "zod";

const querySchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("select"),
    table: z.string().min(1),
    columns: z.array(z.string()).optional(),
    filters: z.array(z.object({
      column: z.string(),
      operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "in", "is"]),
      value: z.unknown(),
    })).optional(),
    order: z.object({ column: z.string(), ascending: z.boolean().optional() }).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    offset: z.number().int().min(0).optional(),
  }),
  z.object({
    operation: z.literal("insert"),
    table: z.string().min(1),
    data: z.record(z.unknown()),
    returning: z.array(z.string()).optional(),
  }),
  z.object({
    operation: z.literal("update"),
    table: z.string().min(1),
    data: z.record(z.unknown()),
    filters: z.array(z.object({
      column: z.string(),
      operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "in", "is"]),
      value: z.unknown(),
    })).min(1), // require at least one filter for safety
    returning: z.array(z.string()).optional(),
  }),
  z.object({
    operation: z.literal("delete"),
    table: z.string().min(1),
    filters: z.array(z.object({
      column: z.string(),
      operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "in", "is"]),
      value: z.unknown(),
    })).min(1), // require at least one filter for safety
    returning: z.array(z.string()).optional(),
  }),
]);

type QueryInput = z.infer<typeof querySchema>;

function buildWhereClause(
  filters: NonNullable<Extract<QueryInput, { operation: "select" }>["filters"]>,
  values: unknown[],
  startIdx: number
): string {
  const parts = filters.map((f) => {
    const idx = values.length + startIdx;
    if (f.operator === "in") {
      const arr = f.value as unknown[];
      const placeholders = arr.map((_, i) => `$${idx + i}`);
      values.push(...arr);
      return `"${f.column}" IN (${placeholders.join(", ")})`;
    }
    if (f.operator === "is") {
      return `"${f.column}" IS ${f.value === null ? "NULL" : "NOT NULL"}`;
    }
    const opMap: Record<string, string> = {
      eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE",
    };
    values.push(f.value);
    return `"${f.column}" ${opMap[f.operator]} $${idx}`;
  });
  return parts.join(" AND ");
}

function sanitizeIdentifier(name: string): string {
  // Only allow alphanumeric + underscore + dot (for schema.table)
  if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return name;
}

export async function POST(req: NextRequest) {
  // 1. Authenticate
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }
  const apiKey = authHeader.slice(7);
  const keyInfo = await validateApiKey(apiKey);
  if (!keyInfo) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  // 2. Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = querySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // 3. Connect to postgres
  // In multi-project setups, each project could have its own DB URL.
  // For now we use the main DB and rely on RLS via SET LOCAL role.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const client = await pool.connect();

  try {
    const values: unknown[] = [];
    let sql = "";

    // Set RLS context
    if (keyInfo.type === "anon") {
      // Set the project_id so RLS policies can use it
      await client.query("SELECT set_config('postbase.project_id', $1, true)", [
        keyInfo.projectId,
      ]);
      await client.query("SELECT set_config('postbase.role', 'anon', true)");
    } else {
      await client.query(
        "SELECT set_config('postbase.project_id', $1, true)",
        [keyInfo.projectId]
      );
      await client.query(
        "SELECT set_config('postbase.role', 'service_role', true)"
      );
    }

    const table = sanitizeIdentifier(input.table);

    switch (input.operation) {
      case "select": {
        const cols =
          input.columns?.map((c) => `"${sanitizeIdentifier(c)}"`).join(", ") ??
          "*";
        sql = `SELECT ${cols} FROM "${table}"`;
        if (input.filters?.length) {
          sql += ` WHERE ${buildWhereClause(input.filters, values, 1)}`;
        }
        if (input.order) {
          const dir = input.order.ascending === false ? "DESC" : "ASC";
          sql += ` ORDER BY "${sanitizeIdentifier(input.order.column)}" ${dir}`;
        }
        if (input.limit) {
          values.push(input.limit);
          sql += ` LIMIT $${values.length}`;
        }
        if (input.offset) {
          values.push(input.offset);
          sql += ` OFFSET $${values.length}`;
        }
        break;
      }

      case "insert": {
        const keys = Object.keys(input.data).map(sanitizeIdentifier);
        const vals = Object.values(input.data);
        const placeholders = vals.map((_, i) => `$${i + 1}`);
        values.push(...vals);
        const returning =
          input.returning?.map((c) => `"${sanitizeIdentifier(c)}"`).join(", ") ??
          "*";
        sql = `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING ${returning}`;
        break;
      }

      case "update": {
        const keys = Object.keys(input.data).map(sanitizeIdentifier);
        const vals = Object.values(input.data);
        const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`);
        values.push(...vals);
        sql = `UPDATE "${table}" SET ${setClauses.join(", ")}`;
        sql += ` WHERE ${buildWhereClause(input.filters, values, values.length + 1)}`;
        const returning =
          input.returning?.map((c) => `"${sanitizeIdentifier(c)}"`).join(", ") ??
          "*";
        sql += ` RETURNING ${returning}`;
        break;
      }

      case "delete": {
        sql = `DELETE FROM "${table}"`;
        sql += ` WHERE ${buildWhereClause(input.filters, values, 1)}`;
        const returning =
          input.returning?.map((c) => `"${sanitizeIdentifier(c)}"`).join(", ") ??
          "*";
        sql += ` RETURNING ${returning}`;
        break;
      }
    }

    const result = await client.query(sql, values);
    return Response.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return Response.json({ error: message }, { status: 400 });
  } finally {
    client.release();
    await pool.end();
  }
}
