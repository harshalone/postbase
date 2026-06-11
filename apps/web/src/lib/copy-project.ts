import { PoolClient } from "pg";
import { db } from "@/lib/db";
import {
  providerConfigs,
  emailSettings,
  emailTemplates,
  storageBuckets,
  storageConnections,
  cronJobs,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TableInfo {
  name: string;
  rowEstimate: number;
}

export interface CopyTableSchemaResult {
  created: string[];
  failed: Array<{ table: string; error: string }>;
}

export interface CopyDataResult {
  table: string;
  rows: number;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AUTH_TABLES = new Set(["users", "accounts", "sessions", "verification_tokens"]);

// Names of extension-owned objects (types, functions, operator classes) living in
// the source schema. Extensions are database-wide and can only be installed once,
// so when an extension (e.g. pgvector) was installed with its objects in the source
// project's schema, the copy must keep references pointing at that schema instead
// of rewriting them to the destination schema — and must never copy the objects.
async function getExtensionOwnedNames(client: PoolClient, schema: string): Promise<Set<string>> {
  const { rows } = await client.query<{ objname: string }>(
    `SELECT t.typname AS objname FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       JOIN pg_depend d ON d.classid = 'pg_type'::regclass AND d.objid = t.oid
        AND d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
      WHERE n.nspname = $1
     UNION
     SELECT p.proname FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
        AND d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
      WHERE n.nspname = $1
     UNION
     SELECT oc.opcname FROM pg_opclass oc
       JOIN pg_namespace n ON n.oid = oc.opcnamespace
       JOIN pg_depend d ON d.classid = 'pg_opclass'::regclass AND d.objid = oc.oid
        AND d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
      WHERE n.nspname = $1`,
    [schema]
  );
  return new Set(rows.map((r) => r.objname));
}

// Builds a rewriter that replaces "srcSchema." prefixes with "dstSchema." in SQL,
// EXCEPT when the qualified name is an extension-owned object that must keep
// resolving against the source schema (where the extension actually lives).
function makeSchemaRewriter(
  srcSchema: string,
  dstSchema: string,
  preserveNames: ReadonlySet<string>
): (sql: string) => string {
  const pattern = new RegExp(`\\b${srcSchema}\\.("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`, "g");
  return (sql: string) =>
    sql.replace(pattern, (match, ident: string) => {
      const name = ident.startsWith('"') ? ident.slice(1, -1) : ident;
      return preserveNames.has(name) ? match : `${dstSchema}.${ident}`;
    });
}

// Copies user-created enum types (not extension-owned) into the destination
// schema so table columns and functions can reference them there.
async function copyEnumTypes(
  client: PoolClient,
  srcSchema: string,
  dstSchema: string
): Promise<Set<string>> {
  const { rows } = await client.query<{ typname: string; labels: string[] }>(
    `SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
     FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = $1
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
         WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid
           AND d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
       )
     GROUP BY t.typname`,
    [srcSchema]
  );
  const copied = new Set<string>();
  for (const r of rows) {
    const labels = r.labels.map((l) => `'${l.replace(/'/g, "''")}'`).join(", ");
    try {
      await client.query(`CREATE TYPE "${dstSchema}"."${r.typname}" AS ENUM (${labels})`);
    } catch { /* already exists */ }
    copied.add(r.typname);
  }
  return copied;
}

// Returns table names in topological order (parents before children via FK deps).
// Tables with no FKs come first. Circular refs are appended at the end.
async function topoSort(client: PoolClient, schema: string, tables: string[]): Promise<string[]> {
  if (tables.length === 0) return [];

  const tableSet = new Set(tables);

  const { rows: deps } = await client.query<{ child: string; parent: string }>(
    `SELECT
       tc.table_name   AS child,
       ccu.table_name  AS parent
     FROM information_schema.table_constraints tc
     JOIN information_schema.referential_constraints rc
       ON rc.constraint_name = tc.constraint_name
       AND rc.constraint_schema = tc.constraint_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = rc.unique_constraint_name
       AND ccu.constraint_schema = rc.unique_constraint_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.constraint_schema = $1`,
    [schema]
  );

  // child → set of tables it must come after
  const after = new Map<string, Set<string>>();
  for (const t of tables) after.set(t, new Set());

  for (const { child, parent } of deps) {
    // Only track FK deps within our set; skip self-refs and FKs into auth tables
    if (tableSet.has(child) && tableSet.has(parent) && child !== parent) {
      after.get(child)!.add(parent);
    }
  }

  // Kahn's algorithm
  const result: string[] = [];
  const remaining = new Set(tables);

  while (remaining.size > 0) {
    // Tables with no unresolved deps
    const ready = [...remaining].filter((t) => after.get(t)!.size === 0).sort();
    if (ready.length === 0) {
      // Circular reference — just push remaining in sorted order
      result.push(...[...remaining].sort());
      break;
    }
    for (const t of ready) {
      result.push(t);
      remaining.delete(t);
      // Remove this table from other tables' dep sets
      for (const deps of after.values()) deps.delete(t);
    }
  }

  return result;
}

// ─── Phase 1: Copy table schemas (structure only, no data) ────────────────────
// Four-pass: (0) sequences, (1) columns+PK, (2) FK constraints, (3) indexes.
//
// Two PostgreSQL auto-increment patterns exist and must both be handled:
//   • SERIAL / nextval()  — column_default = "nextval('schema.seq'::regclass)"
//     The sequence must exist in the dst schema before CREATE TABLE runs, otherwise
//     ::regclass resolution fails at DDL time. We pre-create all sequences from
//     pg_sequences (which covers serial-owned sequences that information_schema misses).
//   • GENERATED AS IDENTITY — is_identity = 'YES', column_default is NULL in
//     information_schema. We must emit "GENERATED ALWAYS/BY DEFAULT AS IDENTITY"
//     in the column def, not a DEFAULT clause.

async function copySequences(client: PoolClient, srcSchema: string, dstSchema: string): Promise<void> {
  // pg_sequences covers ALL sequences including serial-owned ones that
  // information_schema.sequences omits.
  const { rows } = await client.query<{
    sequencename: string;
    start_value: string;
    min_value: string;
    max_value: string;
    increment_by: string;
    cycle: boolean;
    data_type: string;
  }>(
    `SELECT sequencename, start_value, min_value, max_value, increment_by, cycle, data_type
     FROM pg_sequences WHERE schemaname = $1`,
    [srcSchema]
  );
  for (const seq of rows) {
    const cycle = seq.cycle ? "CYCLE" : "NO CYCLE";
    try {
      await client.query(
        `CREATE SEQUENCE IF NOT EXISTS "${dstSchema}"."${seq.sequencename}"
         AS ${seq.data_type}
         START WITH ${seq.start_value}
         INCREMENT BY ${seq.increment_by}
         MINVALUE ${seq.min_value}
         MAXVALUE ${seq.max_value}
         ${cycle}`
      );
    } catch { /* already exists */ }
  }
}

export async function copyTableSchemas(
  client: PoolClient,
  srcSchema: string,
  dstSchema: string
): Promise<CopyTableSchemaResult> {
  await copySequences(client, srcSchema, dstSchema);
  const copiedEnums = await copyEnumTypes(client, srcSchema, dstSchema);
  const extensionNames = await getExtensionOwnedNames(client, srcSchema);
  const rewrite = makeSchemaRewriter(srcSchema, dstSchema, extensionNames);

  const { rows: allTables } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [srcSchema]
  );

  const tables = allTables.map((r) => r.table_name).filter((n) => !AUTH_TABLES.has(n));
  const ordered = await topoSort(client, srcSchema, tables);

  const created: string[] = [];
  const failed: Array<{ table: string; error: string }> = [];

  // Pass 1: columns + primary key only
  for (const table_name of ordered) {
    try {
      // Join pg_attribute for identity info — information_schema.columns.is_identity
      // is correct but we also need identity_generation ('ALWAYS' vs 'BY DEFAULT').
      const { rows: cols } = await client.query<{
        column_name: string;
        data_type: string;
        character_maximum_length: number | null;
        numeric_precision: number | null;
        numeric_scale: number | null;
        is_nullable: string;
        column_default: string | null;
        udt_name: string;
        udt_schema: string;
        is_identity: string;
        identity_generation: string | null;
      }>(
        `SELECT column_name, data_type, character_maximum_length,
                numeric_precision, numeric_scale, is_nullable,
                column_default, udt_name, udt_schema, is_identity, identity_generation
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [srcSchema, table_name]
      );

      const colDefs = cols.map((c) => {
        let typeDef: string;
        if (c.data_type === "character varying") {
          typeDef = c.character_maximum_length ? `varchar(${c.character_maximum_length})` : "varchar";
        } else if (c.data_type === "numeric") {
          typeDef =
            c.numeric_precision !== null
              ? `numeric(${c.numeric_precision},${c.numeric_scale ?? 0})`
              : "numeric";
        } else if (c.data_type === "ARRAY" || c.data_type === "USER-DEFINED") {
          const isArray = c.udt_name.startsWith("_");
          const baseName = isArray ? c.udt_name.slice(1) : c.udt_name;
          const suffix = isArray ? "[]" : "";
          // Resolve the type to the schema where it will actually exist:
          //  • enums we copied into the destination schema → destination schema
          //  • extension-owned types (e.g. pgvector's "vector") and anything else
          //    living in the source schema → keep source schema (extensions are
          //    database-wide and cannot be reinstalled per schema)
          //  • pg_catalog builtins → bare name
          let ns = c.udt_schema;
          if (ns === srcSchema && copiedEnums.has(baseName)) ns = dstSchema;
          typeDef = ns === "pg_catalog" ? `${baseName}${suffix}` : `"${ns}"."${baseName}"${suffix}`;
        } else {
          typeDef = c.data_type;
        }

        const nullable = c.is_nullable === "YES" ? "" : " NOT NULL";

        // GENERATED AS IDENTITY — emit the identity clause, no DEFAULT
        if (c.is_identity === "YES") {
          const gen = c.identity_generation === "ALWAYS" ? "ALWAYS" : "BY DEFAULT";
          return `"${c.column_name}" ${typeDef}${nullable} GENERATED ${gen} AS IDENTITY`;
        }

        // nextval() default — rewrite schema prefix so it points to dst sequences,
        // but preserve references to extension-owned objects (casts, functions)
        const def = c.column_default ? ` DEFAULT ${rewrite(c.column_default)}` : "";
        return `"${c.column_name}" ${typeDef}${nullable}${def}`;
      });

      const { rows: pkCols } = await client.query<{ column_name: string }>(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
           AND kcu.constraint_schema = tc.constraint_schema
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_schema = $1 AND tc.table_name = $2
         ORDER BY kcu.ordinal_position`,
        [srcSchema, table_name]
      );

      const pkDef =
        pkCols.length > 0
          ? `, PRIMARY KEY (${pkCols.map((c) => `"${c.column_name}"`).join(", ")})`
          : "";

      await client.query(
        `CREATE TABLE IF NOT EXISTS "${dstSchema}"."${table_name}" (${colDefs.join(", ")}${pkDef})`
      );
      created.push(table_name);
    } catch (err) {
      failed.push({
        table: table_name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Pass 2: FK constraints (now that all tables exist)
  const { rows: fks } = await client.query<{
    constraint_name: string;
    table_name: string;
    column_name: string;
    foreign_table: string;
    foreign_column: string;
    update_rule: string;
    delete_rule: string;
  }>(
    `SELECT
       tc.constraint_name,
       tc.table_name,
       kcu.column_name,
       ccu.table_name  AS foreign_table,
       ccu.column_name AS foreign_column,
       rc.update_rule,
       rc.delete_rule
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
     JOIN information_schema.referential_constraints rc
       ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = rc.unique_constraint_name
       AND ccu.constraint_schema = rc.unique_constraint_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.constraint_schema = $1`,
    [srcSchema]
  );

  const createdSet = new Set(created);
  for (const fk of fks) {
    // Only add FKs where both sides were successfully created as user tables
    if (!createdSet.has(fk.table_name) || !createdSet.has(fk.foreign_table)) continue;
    try {
      await client.query(
        `ALTER TABLE "${dstSchema}"."${fk.table_name}"
         ADD CONSTRAINT "${fk.constraint_name}"
         FOREIGN KEY ("${fk.column_name}")
         REFERENCES "${dstSchema}"."${fk.foreign_table}" ("${fk.foreign_column}")
         ON UPDATE ${fk.update_rule} ON DELETE ${fk.delete_rule}`
      );
    } catch {
      // Constraint may already exist — ignore
    }
  }

  // Pass 3: indexes (excluding PK indexes which are already implicit)
  for (const table_name of created) {
    const { rows: indexes } = await client.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = $1 AND tablename = $2
         AND indexname NOT LIKE '%_pkey'`,
      [srcSchema, table_name]
    );
    for (const { indexdef } of indexes) {
      const rewritten = indexdef
        .replace(new RegExp(`\\bON ${srcSchema}\\.`, "g"), `ON ${dstSchema}.`)
        .replace(new RegExp(`\\bON "${srcSchema}"\\.`, "g"), `ON "${dstSchema}".`);
      try {
        await client.query(rewritten);
      } catch {
        // Duplicate index — ignore
      }
    }
  }

  return { created, failed };
}

// ─── Phase 2: Copy functions ───────────────────────────────────────────────────

export async function copyFunctions(
  client: PoolClient,
  srcSchema: string,
  dstSchema: string
): Promise<{ copied: number; failed: Array<{ name: string; error: string }> }> {
  // Only plain functions and procedures — aggregates ('a') and window functions
  // ('w') can't be dumped via pg_get_functiondef. Extension-owned functions
  // (e.g. pgvector's vector_in/avg/sum) must not be copied: they belong to the
  // extension living in the source schema, and copying I/O functions creates
  // broken shell types in the destination schema.
  const { rows } = await client.query<{ proname: string; oid: number }>(
    `SELECT p.proname, p.oid
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = $1
       AND p.prokind IN ('f', 'p')
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
         WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid
           AND d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
       )`,
    [srcSchema]
  );

  const extensionNames = await getExtensionOwnedNames(client, srcSchema);
  const rewrite = makeSchemaRewriter(srcSchema, dstSchema, extensionNames);

  let copied = 0;
  const failed: Array<{ name: string; error: string }> = [];

  for (const { proname, oid } of rows) {
    try {
      const { rows: defs } = await client.query<{ def: string }>(
        `SELECT pg_get_functiondef($1) AS def`,
        [oid]
      );
      if (defs.length === 0) continue;
      const rewritten = rewrite(defs[0].def);
      // Wrap in a transaction so SET LOCAL search_path takes effect only for
      // this CREATE OR REPLACE FUNCTION. plpgsql resolves unqualified type refs
      // in DECLARE sections at parse time using the session's current search_path,
      // so the destination schema must be first in search_path during DDL execution.
      await client.query("BEGIN");
      try {
        await client.query(`SET LOCAL search_path = "${dstSchema}", public`);
        await client.query(rewritten);
        await client.query("COMMIT");
      } catch (innerErr) {
        await client.query("ROLLBACK");
        throw innerErr;
      }
      copied++;
    } catch (err) {
      failed.push({ name: proname, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { copied, failed };
}

// ─── Phase 3: Copy triggers ────────────────────────────────────────────────────

export async function copyTriggers(
  client: PoolClient,
  srcSchema: string,
  dstSchema: string
): Promise<{ copied: number; failed: Array<{ name: string; error: string }> }> {
  const { rows } = await client.query<{
    trigger_name: string;
    event_object_table: string;
    action_timing: string;
    event_manipulation: string;
    action_statement: string;
    action_orientation: string;
  }>(
    `SELECT trigger_name, event_object_table, action_timing,
            event_manipulation, action_statement, action_orientation
     FROM information_schema.triggers
     WHERE trigger_schema = $1`,
    [srcSchema]
  );

  // Group multi-event triggers (INSERT OR UPDATE etc.)
  const grouped = new Map<
    string,
    { table: string; timing: string; events: string[]; statement: string; orientation: string }
  >();
  for (const row of rows) {
    const key = `${row.trigger_name}::${row.event_object_table}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        table: row.event_object_table,
        timing: row.action_timing,
        events: [],
        statement: row.action_statement,
        orientation: row.action_orientation,
      });
    }
    grouped.get(key)!.events.push(row.event_manipulation);
  }

  const extensionNames = await getExtensionOwnedNames(client, srcSchema);
  const rewrite = makeSchemaRewriter(srcSchema, dstSchema, extensionNames);

  let copied = 0;
  const failed: Array<{ name: string; error: string }> = [];

  for (const [key, trig] of grouped) {
    const triggerName = key.split("::")[0];
    try {
      const events = trig.events.join(" OR ");
      const forEach = trig.orientation === "ROW" ? "FOR EACH ROW" : "FOR EACH STATEMENT";
      const statement = rewrite(trig.statement);
      await client.query(
        `CREATE OR REPLACE TRIGGER "${triggerName}"
         ${trig.timing} ${events}
         ON "${dstSchema}"."${trig.table}"
         ${forEach} ${statement}`
      );
      copied++;
    } catch (err) {
      failed.push({ name: triggerName, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { copied, failed };
}

// ─── Phase 4: Copy RLS policies ───────────────────────────────────────────────

export async function copyRlsPolicies(
  client: PoolClient,
  srcSchema: string,
  dstSchema: string
): Promise<{ copied: number; failed: Array<{ name: string; error: string }> }> {
  // Enable RLS on tables that had it in source
  const { rows: rlsTables } = await client.query<{ relname: string }>(
    `SELECT c.relname FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relrowsecurity = true AND c.relkind = 'r'`,
    [srcSchema]
  );
  for (const { relname } of rlsTables) {
    try {
      await client.query(
        `ALTER TABLE "${dstSchema}"."${relname}" ENABLE ROW LEVEL SECURITY`
      );
    } catch { /* table may not exist — skip */ }
  }

  // roles is name[] (OID 1003) which node-postgres does NOT parse into a JS
  // array — cast to text[] so it arrives as string[].
  const { rows: policies } = await client.query<{
    policyname: string;
    tablename: string;
    cmd: string;
    permissive: string;
    roles: string[];
    qual: string | null;
    with_check: string | null;
  }>(
    `SELECT policyname, tablename, cmd, permissive, roles::text[] AS roles, qual, with_check
     FROM pg_policies WHERE schemaname = $1`,
    [srcSchema]
  );

  const extensionNames = await getExtensionOwnedNames(client, srcSchema);
  const rewrite = makeSchemaRewriter(srcSchema, dstSchema, extensionNames);

  let copied = 0;
  const failed: Array<{ name: string; error: string }> = [];

  for (const p of policies) {
    try {
      const permissive = p.permissive === "PERMISSIVE" ? "PERMISSIVE" : "RESTRICTIVE";
      const roles = p.roles?.length
        ? `TO ${p.roles.map((r) => (r === "public" ? "public" : `"${r}"`)).join(", ")}`
        : "";
      const using = p.qual ? `USING (${rewrite(p.qual)})` : "";
      const withCheck = p.with_check ? `WITH CHECK (${rewrite(p.with_check)})` : "";
      await client.query(
        `CREATE POLICY "${p.policyname}"
         ON "${dstSchema}"."${p.tablename}"
         AS ${permissive} FOR ${p.cmd} ${roles} ${using} ${withCheck}`
      );
      copied++;
    } catch (err) {
      failed.push({ name: p.policyname, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { copied, failed };
}

// ─── Phase 5: List user tables for data copy ──────────────────────────────────
// Returns tables in FK-safe order with row estimates — caller iterates them.

export async function getTableCopyOrder(
  client: PoolClient,
  srcSchema: string
): Promise<TableInfo[]> {
  const { rows } = await client.query<{ table_name: string; row_estimate: string }>(
    `SELECT
       t.table_name,
       GREATEST(
         COALESCE(s.n_live_tup, 0),
         CASE WHEN c.reltuples >= 0 THEN c.reltuples::bigint ELSE 0 END
       )::text AS row_estimate
     FROM information_schema.tables t
     LEFT JOIN pg_stat_user_tables s
       ON s.schemaname = $1 AND s.relname = t.table_name
     LEFT JOIN pg_class c
       ON c.relname = t.table_name
       AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
     WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'`,
    [srcSchema]
  );

  const tables = rows.map((r) => r.table_name).filter((n) => !AUTH_TABLES.has(n));
  const ordered = await topoSort(client, srcSchema, tables);

  const estimateMap = new Map(rows.map((r) => [r.table_name, parseInt(r.row_estimate, 10) || 0]));
  return ordered.map((name) => ({ name, rowEstimate: estimateMap.get(name) ?? 0 }));
}

// ─── Phase 5: Copy data for a single table ────────────────────────────────────

export async function copyTableData(
  client: PoolClient,
  srcSchema: string,
  dstSchema: string,
  tableName: string
): Promise<CopyDataResult> {
  try {
    // Detect GENERATED ALWAYS AS IDENTITY columns — those require OVERRIDING SYSTEM VALUE
    // in INSERT statements, otherwise Postgres rejects explicit values entirely.
    const { rows: identityCols } = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
         AND is_identity = 'YES' AND identity_generation = 'ALWAYS'`,
      [dstSchema, tableName]
    );
    const overriding = identityCols.length > 0 ? " OVERRIDING SYSTEM VALUE" : "";

    // Disable triggers on destination table during bulk copy to avoid side effects
    await client.query(`ALTER TABLE "${dstSchema}"."${tableName}" DISABLE TRIGGER ALL`);
    const result = await client.query(
      `INSERT INTO "${dstSchema}"."${tableName}"${overriding}
       SELECT * FROM "${srcSchema}"."${tableName}"
       ON CONFLICT DO NOTHING`
    );
    await client.query(`ALTER TABLE "${dstSchema}"."${tableName}" ENABLE TRIGGER ALL`);
    return { table: tableName, rows: result.rowCount ?? 0 };
  } catch (err) {
    // Re-enable triggers even on failure
    try { await client.query(`ALTER TABLE "${dstSchema}"."${tableName}" ENABLE TRIGGER ALL`); } catch { /* ignore */ }
    return {
      table: tableName,
      rows: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Phase 5b: Copy auth tables (users, accounts, sessions) ──────────────────
// Auth tables are skipped in the main data copy. This opt-in phase copies them
// in FK-safe order: users first, then accounts and sessions which depend on it.
// verification_tokens are excluded — they're short-lived and useless after copy.

export async function copyAuthTableData(
  client: PoolClient,
  srcSchema: string,
  dstSchema: string
): Promise<{ table: string; rows: number; error?: string }[]> {
  const results: { table: string; rows: number; error?: string }[] = [];

  for (const tableName of ["users", "accounts", "sessions"] as const) {
    try {
      await client.query(`ALTER TABLE "${dstSchema}"."${tableName}" DISABLE TRIGGER ALL`);
      const result = await client.query(
        `INSERT INTO "${dstSchema}"."${tableName}"
         SELECT * FROM "${srcSchema}"."${tableName}"
         ON CONFLICT DO NOTHING`
      );
      await client.query(`ALTER TABLE "${dstSchema}"."${tableName}" ENABLE TRIGGER ALL`);
      results.push({ table: tableName, rows: result.rowCount ?? 0 });
    } catch (err) {
      try { await client.query(`ALTER TABLE "${dstSchema}"."${tableName}" ENABLE TRIGGER ALL`); } catch { /* ignore */ }
      results.push({
        table: tableName,
        rows: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

// ─── Metadata copy (Drizzle / _postbase schema tables) ───────────────────────

export async function copyProviderConfigs(
  srcProjectId: string,
  dstProjectId: string
): Promise<number> {
  const rows = await db
    .select()
    .from(providerConfigs)
    .where(eq(providerConfigs.projectId, srcProjectId));
  if (rows.length === 0) return 0;
  await db.insert(providerConfigs).values(
    rows.map(({ id: _id, projectId: _pid, createdAt: _ca, updatedAt: _ua, ...rest }) => ({
      ...rest,
      projectId: dstProjectId,
    }))
  );
  return rows.length;
}

export async function copyEmailSettings(
  srcProjectId: string,
  dstProjectId: string
): Promise<boolean> {
  const [settings] = await db
    .select()
    .from(emailSettings)
    .where(eq(emailSettings.projectId, srcProjectId));
  if (!settings) return false;
  const { id: _id, projectId: _pid, createdAt: _ca, updatedAt: _ua, ...rest } = settings;
  await db.insert(emailSettings).values({ ...rest, projectId: dstProjectId });
  return true;
}

export async function copyEmailTemplates(
  srcProjectId: string,
  dstProjectId: string
): Promise<number> {
  const rows = await db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.projectId, srcProjectId));
  if (rows.length === 0) return 0;
  await db.insert(emailTemplates).values(
    rows.map(({ id: _id, projectId: _pid, createdAt: _ca, updatedAt: _ua, ...rest }) => ({
      ...rest,
      projectId: dstProjectId,
    }))
  );
  return rows.length;
}

export async function copyStorageBuckets(
  srcProjectId: string,
  dstProjectId: string
): Promise<number> {
  const rows = await db
    .select()
    .from(storageBuckets)
    .where(eq(storageBuckets.projectId, srcProjectId));
  if (rows.length === 0) return 0;
  await db.insert(storageBuckets).values(
    rows.map(({ id: _id, projectId: _pid, createdAt: _ca, ...rest }) => ({
      ...rest,
      projectId: dstProjectId,
    }))
  );
  return rows.length;
}

export async function copyStorageConnections(
  srcProjectId: string,
  dstProjectId: string
): Promise<number> {
  const rows = await db
    .select()
    .from(storageConnections)
    .where(eq(storageConnections.projectId, srcProjectId));
  if (rows.length === 0) return 0;
  await db.insert(storageConnections).values(
    rows.map(({ id: _id, projectId: _pid, createdAt: _ca, updatedAt: _ua, ...rest }) => ({
      ...rest,
      projectId: dstProjectId,
    }))
  );
  return rows.length;
}

export async function copyCronJobs(
  srcProjectId: string,
  dstProjectId: string
): Promise<number> {
  const rows = await db
    .select()
    .from(cronJobs)
    .where(eq(cronJobs.projectId, srcProjectId));
  if (rows.length === 0) return 0;
  await db.insert(cronJobs).values(
    rows.map(({ id: _id, projectId: _pid, createdAt: _ca, updatedAt: _ua, ...rest }) => ({
      ...rest,
      projectId: dstProjectId,
    }))
  );
  return rows.length;
}
