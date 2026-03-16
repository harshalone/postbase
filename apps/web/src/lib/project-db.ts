import { Pool, PoolClient } from "pg";

// Each project gets its own PostgreSQL schema: proj_<uuid_no_hyphens>
export function getProjectSchema(projectId: string): string {
  return `proj_${projectId.replace(/-/g, "")}`;
}

// Build a pool for the project (uses per-project DB if configured, else global)
export function getProjectPool(databaseUrl?: string | null): Pool {
  return new Pool({ connectionString: databaseUrl || process.env.DATABASE_URL! });
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
