/**
 * @swagger
 * /api/db/query:
 *   post:
 *     summary: Execute database queries
 *     tags: [Database]
 *     description: Execute database operations (select, insert, update, upsert, delete) securely honoring Row Level Security (RLS) policies based on the provided authorization token.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Postbase-Token
 *         required: false
 *         description: Optional access JWT that identifies the authenticated user for RLS.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [operation, table]
 *             properties:
 *               operation:
 *                 type: string
 *                 enum: [select, insert, update, upsert, delete]
 *               table:
 *                 type: string
 *               columns:
 *                 type: array
 *                 items:
 *                   type: string
 *               filters:
 *                 type: array
 *                 items:
 *                   type: object
 *               data:
 *                 type: object
 *               limit:
 *                 type: integer
 *               offset:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Query executed successfully
 *       401:
 *         description: Missing or invalid API key
 */
import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { validateApiKey } from "@/lib/auth/keys";
import { verifyJwt, getJwtSecret } from "@/lib/auth/jwt";
import { getProjectSchema } from "@/lib/project-db";
import { z } from "zod";
import { sql, SQL } from "drizzle-orm";
import { buildWhereSql, Filter as QueryFilter, toRawQuery } from "@/lib/db/query-helper";

const filterOperators = z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is", "contains", "overlaps", "textSearch"]);

const filterSchema = z.object({
  column: z.string(),
  operator: filterOperators,
  value: z.unknown(),
});

const orFilterSchema = z.string();
const notFilterSchema = z.object({ column: z.string(), operator: z.string(), value: z.unknown() });

const baseQueryFields = {
  table: z.string().min(1),
  orFilters: z.array(orFilterSchema).optional(),
  notFilters: z.array(notFilterSchema).optional(),
  order: z.array(z.object({ column: z.string(), ascending: z.boolean().optional(), nullsFirst: z.boolean().optional() })).optional(),
  limit: z.number().int().min(1).max(10000).optional(),
  offset: z.number().int().min(0).optional(),
  range: z.object({ from: z.number().int(), to: z.number().int() }).optional(),
};

const querySchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("select"),
    ...baseQueryFields,
    columns: z.array(z.string()).optional(),
    filters: z.array(filterSchema).optional(),
    count: z.enum(["exact", "planned", "estimated"]).optional(),
    head: z.boolean().optional(),
  }),
  z.object({
    operation: z.literal("insert"),
    ...baseQueryFields,
    data: z.union([z.record(z.unknown()), z.array(z.record(z.unknown()))]),
    returning: z.string().optional(),
  }),
  z.object({
    operation: z.literal("upsert"),
    ...baseQueryFields,
    data: z.union([z.record(z.unknown()), z.array(z.record(z.unknown()))]),
    onConflict: z.string().optional(),
    returning: z.string().optional(),
  }),
  z.object({
    operation: z.literal("update"),
    ...baseQueryFields,
    data: z.record(z.unknown()),
    filters: z.array(filterSchema).optional(),
    returning: z.string().optional(),
  }),
  z.object({
    operation: z.literal("delete"),
    ...baseQueryFields,
    filters: z.array(filterSchema).optional(),
    returning: z.string().optional(),
  }),
]);

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
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = querySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // 3. Resolve authenticated user JWT for RLS
  let userId: string | null = null;
  const sessionToken = req.headers.get("x-postbase-token") ?? req.headers.get("x-postbase-session");
  if (sessionToken) {
    try {
      const secret = getJwtSecret();
      const payload = await verifyJwt(sessionToken, secret);
      if (payload && payload.pid === keyInfo.projectId) {
        userId = payload.sub;
      }
    } catch {
      // ignore
    }
  }

  // 4. Connect to postgres
  const client = await pool.connect();

  try {
    // Set search_path to project schema so bare table names resolve correctly
    const schema = getProjectSchema(keyInfo.projectId);
    await client.query(`SET search_path TO ${toRawQuery(sql`${sql.identifier(schema)}`).text}, public`);

    // Set RLS context
    await client.query("SELECT set_config('postbase.project_id', $1, true)", [keyInfo.projectId]);
    await client.query("SELECT set_config('postbase.role', $1, true)", [keyInfo.type]);
    if (userId) {
      await client.query("SELECT set_config('postbase.user_id', $1, true)", [userId]);
    }

    const orFilters = ("orFilters" in input ? input.orFilters : undefined) ?? [];
    const notFilters = ("notFilters" in input ? input.notFilters : undefined) ?? [];
    const filters = ("filters" in input ? input.filters : undefined) ?? [];
    const orderBy = input.order ?? [];
    const returningClause = "returning" in input && input.returning ? input.returning : "*";

    // Build WHERE clause SQL
    const whereSql = buildWhereSql(filters as QueryFilter[], orFilters, notFilters as QueryFilter[]);
    const whereFragment = whereSql ? sql` WHERE ${whereSql}` : sql``;

    // Helper for returning clause
    const getReturning = () => {
      if (returningClause === "*") return sql` RETURNING *`;
      const cols = returningClause.split(",").map(c => sql.identifier(c.trim()));
      return sql` RETURNING ${sql.join(cols, sql`, `)}`;
    };

    let query: SQL;

    switch (input.operation) {
      case "select": {
        if (input.head) {
          query = sql`SELECT COUNT(*) FROM ${sql.identifier(input.table)}${whereFragment}`;
          const result = await client.query(toRawQuery(query));
          return Response.json({ data: null, count: parseInt(result.rows[0].count, 10) });
        }

        const colsStr = input.columns?.flatMap((c) => c.split(",").map((s) => s.trim()).filter(Boolean)) ?? [];
        const selectCols = colsStr.length > 0 
          ? sql.join(colsStr.map(c => sql.identifier(c)), sql`, `)
          : sql`*`;

        const baseQuery = sql`SELECT ${selectCols} FROM ${sql.identifier(input.table)}${whereFragment}`;
        
        let orderFragment = sql``;
        if (orderBy.length) {
          const parts = orderBy.map(o => {
            const col = sql.identifier(o.column);
            const dir = o.ascending === false ? sql`DESC` : sql`ASC`;
            const nulls = o.nullsFirst ? sql` NULLS FIRST` : sql``;
            return sql`${col} ${dir}${nulls}`;
          });
          orderFragment = sql` ORDER BY ${sql.join(parts, sql`, `)}`;
        }

        const limitFragment = input.limit ? sql` LIMIT ${input.limit}` : sql``;
        const offsetFragment = input.offset ? sql` OFFSET ${input.offset}` : sql``;

        if (input.count === "exact") {
          const countQuery = sql`SELECT COUNT(*) FROM ${sql.identifier(input.table)}${whereFragment}`;
          const countResult = await client.query(toRawQuery(countQuery));
          const total = parseInt(countResult.rows[0].count, 10);

          const finalQuery = sql`${baseQuery}${orderFragment}${limitFragment}${offsetFragment}`;
          const result = await client.query(toRawQuery(finalQuery));
          return Response.json({ data: result.rows, count: total });
        }

        query = sql`${baseQuery}${orderFragment}${limitFragment}${offsetFragment}`;
        break;
      }

      case "insert": {
        const rows = Array.isArray(input.data) ? input.data : [input.data];
        if (rows.length === 0) return Response.json({ data: [], count: 0 });

        const keys = Object.keys(rows[0]);
        const columns = sql.join(keys.map(k => sql.identifier(k)), sql`, `);
        
        const valuesList = rows.map(row => {
          const vals = keys.map(k => sql`${row[k]}`);
          return sql`(${sql.join(vals, sql`, `)})`;
        });

        query = sql`INSERT INTO ${sql.identifier(input.table)} (${columns}) VALUES ${sql.join(valuesList, sql`, `)}${getReturning()}`;
        break;
      }

      case "upsert": {
        const rows = Array.isArray(input.data) ? input.data : [input.data];
        if (rows.length === 0) return Response.json({ data: [], count: 0 });

        const keys = Object.keys(rows[0]);
        const columns = sql.join(keys.map(k => sql.identifier(k)), sql`, `);
        
        const valuesList = rows.map(row => {
          const vals = keys.map(k => sql`${row[k]}`);
          return sql`(${sql.join(vals, sql`, `)})`;
        });

        const conflictFragment = input.onConflict 
          ? sql` ON CONFLICT (${sql.join(input.onConflict.split(",").map(c => sql.identifier(c.trim())), sql`, `)})`
          : sql` ON CONFLICT`;

        const updateCols = sql.join(keys.map(k => sql`${sql.identifier(k)} = EXCLUDED.${sql.identifier(k)}`), sql`, `);
        const updateFragment = input.onConflict ? sql` DO UPDATE SET ${updateCols}` : sql` DO NOTHING`;

        query = sql`INSERT INTO ${sql.identifier(input.table)} (${columns}) VALUES ${sql.join(valuesList, sql`, `)}${conflictFragment}${updateFragment}${getReturning()}`;
        break;
      }

      case "update": {
        const keys = Object.keys(input.data);
        const setClauses = sql.join(keys.map(k => sql`${sql.identifier(k)} = ${input.data[k]}`), sql`, `);

        query = sql`UPDATE ${sql.identifier(input.table)} SET ${setClauses}${whereFragment}${getReturning()}`;
        break;
      }

      case "delete": {
        query = sql`DELETE FROM ${sql.identifier(input.table)}${whereFragment}${getReturning()}`;
        break;
      }

      default:
        return Response.json({ error: "Unsupported operation" }, { status: 400 });
    }

    const result = await client.query(toRawQuery(query));
    return Response.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    console.error("[db/query] ERROR:", message, "| table:", input.table, "| operation:", input.operation, "| schema:", getProjectSchema(keyInfo.projectId));
    return Response.json({ error: message }, { status: 400 });
  } finally {
    await client.query('RESET search_path').catch(() => {});
    client.release();
  }
}
