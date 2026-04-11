import { sql, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { QueryConfig } from "pg";

export type RawQueryConfig = QueryConfig;

const dialect = new PgDialect();

export function toRawQuery(s: SQL): RawQueryConfig {
  const { sql: sqlText, params } = dialect.sqlToQuery(s);
  return { text: sqlText, values: params };
}

export type Filter = {
  column: string;
  operator: string;
  value: unknown;
};

/**
 * Maps our API's operator names to SQL expressions.
 * Supports: eq, neq, gt, gte, lt, lte, like, ilike, in, is, contains, overlaps, textSearch.
 */
export function buildFilterSql(filter: Filter): SQL | null {
  const col = sql.identifier(filter.column);

  switch (filter.operator) {
    case "eq":
      return sql`${col} = ${filter.value}`;
    case "neq":
      return sql`${col} != ${filter.value}`;
    case "gt":
      return sql`${col} > ${filter.value}`;
    case "gte":
      return sql`${col} >= ${filter.value}`;
    case "lt":
      return sql`${col} < ${filter.value}`;
    case "lte":
      return sql`${col} <= ${filter.value}`;
    case "like":
      return sql`${col} LIKE ${filter.value}`;
    case "ilike":
      return sql`${col} ILIKE ${filter.value}`;
    case "in": {
      const arr = Array.isArray(filter.value) ? filter.value : [filter.value];
      if (arr.length === 0) return sql`FALSE`;
      return sql`${col} IN (${sql.join(arr.map((v) => sql`${v}`), sql`, `)})`;
    }
    case "is": {
      if (filter.value === null) return sql`${col} IS NULL`;
      if (filter.value === true) return sql`${col} IS TRUE`;
      if (filter.value === false) return sql`${col} IS FALSE`;
      return sql`${col} IS NOT NULL`;
    }
    case "contains":
      return sql`${col} @> ${JSON.stringify(filter.value)}::jsonb`;
    case "overlaps":
      return sql`${col} && ${filter.value}`;
    case "textSearch": {
      const ts = filter.value as { query: string; config?: string };
      const config = ts.config ?? "english";
      return sql`to_tsvector(${config}, ${col}) @@ plainto_tsquery(${config}, ${ts.query})`;
    }
    default:
      return sql`${col} = ${filter.value}`;
  }
}

/**
 * Builds a WHERE clause from filters, orFilters, and notFilters.
 */
export function buildWhereSql(
  filters: Filter[] = [],
  orFilters: string[] = [],
  notFilters: Filter[] = []
): SQL | null {
  const parts: SQL[] = [];

  for (const f of filters) {
    const part = buildFilterSql(f);
    if (part) parts.push(part);
  }

  for (const f of notFilters) {
    const part = buildFilterSql(f);
    if (part) parts.push(sql`NOT (${part})`);
  }

  for (const orStr of orFilters) {
    const orParts: SQL[] = [];
    const segments = orStr.split(",").map((s) => s.trim()).filter(Boolean);
    
    for (const segment of segments) {
      const [col, op, ...rest] = segment.split(".");
      const val = rest.join(".");
      const part = buildFilterSql({ column: col, operator: op, value: val });
      if (part) orParts.push(part);
    }

    if (orParts.length > 0) {
      parts.push(sql`(${sql.join(orParts, sql` OR `)})`);
    }
  }

  if (parts.length === 0) return null;
  return sql.join(parts, sql` AND `);
}
