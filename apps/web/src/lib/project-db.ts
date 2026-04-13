import { Pool, PoolClient } from "pg";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Each project gets its own PostgreSQL schema: proj_<uuid_no_hyphens>
export function getProjectSchema(projectId: string): string {
  return `proj_${projectId.replace(/-/g, "")}`;
}

// Singleton pool cache keyed by connection string.
const poolCache = new Map<string, Pool>();

function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // If a pool encounters a fatal error, remove it from cache so the next
  // call to getProjectPool creates a fresh one.
  pool.on("error", (err) => {
    console.error("[project-db] pool error, evicting from cache:", err.message);
    poolCache.delete(connectionString);
  });
  return pool;
}

export function getProjectPool(databaseUrl?: string | null): Pool {
  const connectionString = databaseUrl || process.env.DATABASE_URL!;
  let pool = poolCache.get(connectionString);

  // Replace pool if it was ended or is missing
  if (!pool || (pool as unknown as { ending?: boolean }).ending) {
    pool = createPool(connectionString);
    poolCache.set(connectionString, pool);
  }

  return pool;
}

// Create the schema if it doesn't exist; returns the schema name
export async function ensureProjectSchema(
  client: PoolClient,
  projectId: string
): Promise<string> {
  const schema = getProjectSchema(projectId);
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  return schema;
}

// Run a query with search_path set to the project schema
export async function withProjectSchema<T>(
  pool: Pool,
  projectId: string,
  fn: (client: PoolClient, schema: string) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    return await fn(client, schema);
  } finally {
    client.release();
  }
}

// Fetch a project record by ID (used by auth routes to get databaseUrl)
export async function getProjectById(
  projectId: string
): Promise<{ id: string; databaseUrl: string | null } | null> {
  const [project] = await db
    .select({ id: projects.id, databaseUrl: projects.databaseUrl })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project ?? null;
}

// ─── Per-project auth tables ──────────────────────────────────────────────────
// Creates users, accounts, sessions, verification_tokens in the project schema.
// Idempotent — safe to call on every request.

// Bump this version whenever new tables/columns are added to ensureProjectAuthTables.
// The cache stores the last version each schema was migrated to; if the stored
// version is lower than SCHEMA_VERSION, migrations are re-run.
const SCHEMA_VERSION = 2;
const initialisedSchemas = new Map<string, number>();

export async function ensureProjectAuthTables(
  client: PoolClient,
  schema: string
): Promise<void> {
  if ((initialisedSchemas.get(schema) ?? 0) >= SCHEMA_VERSION) return;

  // Use a session-level advisory lock keyed on the schema name to prevent
  // concurrent DDL races (which cause "duplicate key in pg_type" errors).
  const lockKey = schema
    .split("")
    .reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) & 0x7fffffff, 0);
  await client.query(`SELECT pg_advisory_lock($1)`, [lockKey]);

  try {
    // Re-check after acquiring the lock — another request may have finished.
    if ((initialisedSchemas.get(schema) ?? 0) >= SCHEMA_VERSION) return;

    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."users" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"            text,
        "email"           text NOT NULL,
        "email_verified"  timestamp,
        "image"           text,
        "password_hash"   text,
        "phone"           text,
        "phone_verified"  timestamp,
        "is_anonymous"    boolean DEFAULT false,
        "metadata"        jsonb DEFAULT '{}'::jsonb,
        "banned_at"       timestamp,
        "created_at"      timestamp DEFAULT now() NOT NULL,
        "updated_at"      timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "${schema}_users_email_unique" UNIQUE ("email")
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."accounts" (
        "user_id"              uuid NOT NULL REFERENCES "${schema}"."users"("id") ON DELETE CASCADE,
        "type"                 text NOT NULL,
        "provider"             text NOT NULL,
        "provider_account_id"  text NOT NULL,
        "refresh_token"        text,
        "access_token"         text,
        "expires_at"           integer,
        "token_type"           text,
        "scope"                text,
        "id_token"             text,
        "session_state"        text,
        PRIMARY KEY ("provider", "provider_account_id")
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."sessions" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "session_token"  text NOT NULL,
        "user_id"        uuid NOT NULL REFERENCES "${schema}"."users"("id") ON DELETE CASCADE,
        "expires"        timestamp NOT NULL,
        "created_at"     timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "${schema}_sessions_token_unique" UNIQUE ("session_token")
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."verification_tokens" (
        "identifier"  text NOT NULL,
        "token"       text NOT NULL,
        "expires"     timestamp NOT NULL,
        PRIMARY KEY ("identifier", "token")
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS "${schema}_accounts_user_idx"
        ON "${schema}"."accounts" ("user_id")
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS "${schema}_sessions_user_idx"
        ON "${schema}"."sessions" ("user_id")
    `);

    initialisedSchemas.set(schema, SCHEMA_VERSION);
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1)`, [lockKey]);
  }
}
