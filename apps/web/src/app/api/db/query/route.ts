/**
 * Database query API
 * POST /api/db/query
 *
 * Headers:
 *   Authorization: Bearer <anon-key | service-role-key>
 *   X-Postbase-Token: <access-jwt>  (optional — identifies the authenticated user for RLS)
 *   Content-Type: application/json
 *
 * anon key   → enforces RLS
 * service key → bypasses RLS, full access
 */
import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { validateApiKey } from "@/lib/auth/keys";
import { verifyJwt, getJwtSecret } from "@/lib/auth/jwt";
import { z } from "zod";

const filterOperators = z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is", "contains", "overlaps", "textSearch"]);

const filterSchema = z.object({
  column: z.string(),
  operator: filterOperators,
  value: z.unknown(),
});

const orFilterSchema = z.string(); // raw filter string like "name.eq.foo,age.gt.18"
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

type QueryInput = z.infer<typeof querySchema>;
type Filter = { column: string; operator: string; value: unknown };

function sanitizeIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return name;
}

function buildFilterClause(filter: Filter, values: unknown[]): string {
  const col = `"${sanitizeIdentifier(filter.column)}"`;

  switch (filter.operator) {
    case "in": {
      const arr = filter.value as unknown[];
      if (!arr.length) return "FALSE";
      const placeholders = arr.map(() => { values.push(arr[values.length]); return `$${values.length}`; });
      // Fix: push all at once
      values.splice(values.length - arr.length, arr.length);
      arr.forEach((v) => values.push(v));
      const phs = arr.map((_, i) => `$${values.length - arr.length + i + 1}`);
      return `${col} IN (${phs.join(", ")})`;
    }
    case "is": {
      if (filter.value === null) return `${col} IS NULL`;
      if (filter.value === true) return `${col} IS TRUE`;
      if (filter.value === false) return `${col} IS FALSE`;
      return `${col} IS NOT NULL`;
    }
    case "contains": {
      values.push(JSON.stringify(filter.value));
      return `${col} @> $${values.length}::jsonb`;
    }
    case "overlaps": {
      values.push(filter.value);
      return `${col} && $${values.length}`;
    }
    case "textSearch": {
      const ts = filter.value as { query: string; config?: string };
      const config = ts.config ?? "english";
      values.push(ts.query);
      return `to_tsvector('${config}', ${col}) @@ plainto_tsquery('${config}', $${values.length})`;
    }
    default: {
      const opMap: Record<string, string> = {
        eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE", ilike: "ILIKE",
      };
      values.push(filter.value);
      return `${col} ${opMap[filter.operator] ?? "="} $${values.length}`;
    }
  }
}

function buildWhereClause(filters: Filter[], orFilters: string[], notFilters: Array<{ column: string; operator: string; value: unknown }>, values: unknown[]): string {
  const parts: string[] = [];

  for (const f of filters) {
    parts.push(buildFilterClause(f, values));
  }

  for (const notF of notFilters) {
    parts.push(`NOT (${buildFilterClause(notF, values)})`);
  }

  // orFilters are strings like "status.eq.active,role.eq.admin"
  for (const orStr of orFilters) {
    const orParts = orStr.split(",").map((part) => {
      const [col, op, ...rest] = part.trim().split(".");
      const val = rest.join(".");
      return buildFilterClause({ column: col, operator: op, value: val }, values);
    });
    if (orParts.length > 0) parts.push(`(${orParts.join(" OR ")})`);
  }

  return parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "";
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
      // ignore — just use anon role
    }
  }

  // 4. Connect to postgres
  const client = await pool.connect();

  try {
    const values: unknown[] = [];
    let sql = "";

    // Set RLS context
    await client.query("SELECT set_config('postbase.project_id', $1, true)", [keyInfo.projectId]);
    await client.query("SELECT set_config('postbase.role', $1, true)", [keyInfo.type]);
    if (userId) {
      await client.query("SELECT set_config('postbase.user_id', $1, true)", [userId]);
    }

    const table = sanitizeIdentifier(input.table);
    const orFilters = ("orFilters" in input ? input.orFilters : undefined) ?? [];
    const notFilters = ("notFilters" in input ? input.notFilters : undefined) ?? [];
    const filters = ("filters" in input ? input.filters : undefined) ?? [];
    const orderBy = input.order ?? [];
    const returning = "returning" in input && input.returning ? input.returning : "*";

    switch (input.operation) {
      case "select": {
        if (input.head) {
          // COUNT only
          const whereClause = buildWhereClause(filters as Filter[], orFilters, notFilters as Filter[], values);
          sql = `SELECT COUNT(*) FROM "${table}" ${whereClause}`;
          const result = await client.query(sql, values);
          return Response.json({ data: null, count: parseInt(result.rows[0].count, 10) });
        }

        const cols = input.columns?.map((c) => `"${sanitizeIdentifier(c)}"`).join(", ") ?? "*";
        const whereClause = buildWhereClause(filters as Filter[], orFilters, notFilters as Filter[], values);

        if (input.count === "exact") {
          // Run COUNT alongside
          const countSql = `SELECT COUNT(*) FROM "${table}" ${whereClause}`;
          const countResult = await client.query(countSql, values);
          const total = parseInt(countResult.rows[0].count, 10);

          sql = `SELECT ${cols} FROM "${table}" ${whereClause}`;
          if (orderBy.length) {
            sql += " ORDER BY " + orderBy.map(o => `"${sanitizeIdentifier(o.column)}" ${o.ascending === false ? "DESC" : "ASC"}${o.nullsFirst ? " NULLS FIRST" : ""}`).join(", ");
          }
          if (input.limit) { values.push(input.limit); sql += ` LIMIT $${values.length}`; }
          if (input.offset) { values.push(input.offset); sql += ` OFFSET $${values.length}`; }

          const result = await client.query(sql, values);
          return Response.json({ data: result.rows, count: total });
        }

        sql = `SELECT ${cols} FROM "${table}" ${whereClause}`;
        if (orderBy.length) {
          sql += " ORDER BY " + orderBy.map(o => `"${sanitizeIdentifier(o.column)}" ${o.ascending === false ? "DESC" : "ASC"}${o.nullsFirst ? " NULLS FIRST" : ""}`).join(", ");
        }
        if (input.limit) { values.push(input.limit); sql += ` LIMIT $${values.length}`; }
        if (input.offset) { values.push(input.offset); sql += ` OFFSET $${values.length}`; }
        break;
      }

      case "insert": {
        const rows = Array.isArray(input.data) ? input.data : [input.data];
        if (rows.length === 0) return Response.json({ data: [], count: 0 });

        const keys = Object.keys(rows[0]).map(sanitizeIdentifier);
        const placeholders = rows.map((row, ri) =>
          `(${Object.values(row).map((_, ci) => { values.push(Object.values(row)[ci]); return `$${values.length}`; }).join(", ")})`
        );

        // Fix placeholder building
        values.length = 0;
        const allPlaceholders = rows.map((row) => {
          const rowVals = Object.values(row);
          const phs = rowVals.map((v) => { values.push(v); return `$${values.length}`; });
          return `(${phs.join(", ")})`;
        });

        sql = `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES ${allPlaceholders.join(", ")} RETURNING ${returning}`;
        break;
      }

      case "upsert": {
        const rows = Array.isArray(input.data) ? input.data : [input.data];
        if (rows.length === 0) return Response.json({ data: [], count: 0 });

        const keys = Object.keys(rows[0]).map(sanitizeIdentifier);
        values.length = 0;
        const allPlaceholders = rows.map((row) => {
          const rowVals = Object.values(row);
          const phs = rowVals.map((v) => { values.push(v); return `$${values.length}`; });
          return `(${phs.join(", ")})`;
        });

        const conflict = input.onConflict ? `(${input.onConflict.split(",").map((c) => `"${sanitizeIdentifier(c.trim())}"`).join(", ")})` : "";
        const updateCols = keys.map((k) => `"${k}" = EXCLUDED."${k}"`).join(", ");

        sql = `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES ${allPlaceholders.join(", ")}`;
        sql += conflict ? ` ON CONFLICT ${conflict} DO UPDATE SET ${updateCols}` : ` ON CONFLICT DO NOTHING`;
        sql += ` RETURNING ${returning}`;
        break;
      }

      case "update": {
        const keys = Object.keys(input.data).map(sanitizeIdentifier);
        const vals = Object.values(input.data);
        vals.forEach((v) => values.push(v));
        const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`);

        const whereClause = buildWhereClause(filters as Filter[], orFilters, notFilters as Filter[], values);
        sql = `UPDATE "${table}" SET ${setClauses.join(", ")} ${whereClause} RETURNING ${returning}`;
        break;
      }

      case "delete": {
        const whereClause = buildWhereClause(filters as Filter[], orFilters, notFilters as Filter[], values);
        sql = `DELETE FROM "${table}" ${whereClause} RETURNING ${returning}`;
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
  }
}
