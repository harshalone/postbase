import type { PoolClient } from "pg";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

// Row-level security only applies to roles that are neither superusers nor
// BYPASSRLS. The pool logs in as a superuser, so enforcement works by
// switching to a weaker role with SET LOCAL ROLE for the life of the
// transaction. Opt-in per project via the dashboard setting
// (projects.enforce_rls) or ENFORCE_RLS_PROJECT_IDS (comma-separated project
// ids, or "*" for all). Either one enables it.

export const ANON_ROLE = "postbase_anon";
export const AUTHENTICATED_ROLE = "postbase_authenticated";

type DbRole = typeof ANON_ROLE | typeof AUTHENTICATED_ROLE;

// Tables holding credentials; never reachable by anon/authenticated roles.
const PROTECTED_TABLES = ["users", "accounts", "sessions", "verification_tokens"] as const;

const SCHEMA_RE = /^proj_[0-9a-f]{32}$/;

// Accepts a project uuid or its proj_<hex> schema name.
const normalizeId = (id: string) => id.trim().toLowerCase().replace(/^proj_/, "").replace(/-/g, "");

/** Env-var check only (no DB lookup). */
export function isRlsEnforced(projectIdOrSchema: string): boolean {
  const raw = process.env.ENFORCE_RLS_PROJECT_IDS ?? "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.includes("*")) return true;
  return ids.map(normalizeId).includes(normalizeId(projectIdOrSchema));
}

const FLAG_TTL_MS = 10_000;
const flagCache = new Map<string, { value: boolean; at: number }>();

export function invalidateRlsCache(projectIdOrSchema: string): void {
  flagCache.delete(normalizeId(projectIdOrSchema));
}

/** Env var or the per-project dashboard flag. The flag is cached briefly. */
export async function isRlsEnforcedForProject(projectIdOrSchema: string): Promise<boolean> {
  if (isRlsEnforced(projectIdOrSchema)) return true;
  const key = normalizeId(projectIdOrSchema);
  const hit = flagCache.get(key);
  if (hit && Date.now() - hit.at < FLAG_TTL_MS) return hit.value;
  if (!/^[0-9a-f]{32}$/.test(key)) return false;
  const uuid = key.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  const [row] = await db
    .select({ enforceRls: projects.enforceRls })
    .from(projects)
    .where(eq(projects.id, uuid))
    .limit(1);
  const value = row?.enforceRls ?? false;
  flagCache.set(key, { value, at: Date.now() });
  return value;
}

/** Role to run a request as, or null to keep the full-power pool role. */
export function roleFor(keyType: string, userId: string | null): DbRole | null {
  if (keyType === "service_role") return null;
  // Anything that isn't the service key fails closed to a restricted role.
  return keyType === "anon" && userId ? AUTHENTICATED_ROLE : ANON_ROLE;
}

/**
 * Switch the current transaction to the restricted role for this request.
 * Must be called inside BEGIN. Returns true if a role was applied.
 */
export async function applyRequestRole(
  client: PoolClient,
  projectId: string,
  keyType: string,
  userId: string | null
): Promise<boolean> {
  if (!(await isRlsEnforcedForProject(projectId))) return false;
  const role = roleFor(keyType, userId);
  if (!role) return false;
  // role is one of two constants, never user input
  await client.query(`SET LOCAL ROLE ${role}`);
  return true;
}

/** Create the two restricted roles. Idempotent; needs a superuser/CREATEROLE. */
export async function ensureRlsRoles(client: PoolClient): Promise<void> {
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ANON_ROLE}') THEN
        CREATE ROLE ${ANON_ROLE} NOLOGIN NOINHERIT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${AUTHENTICATED_ROLE}') THEN
        CREATE ROLE ${AUTHENTICATED_ROLE} NOLOGIN NOINHERIT;
      END IF;
    END $$`);
  await client.query(`GRANT ${ANON_ROLE}, ${AUTHENTICATED_ROLE} TO CURRENT_USER`);
  // Keep the shared public schema off-limits to the restricted roles.
  await client.query(`REVOKE ALL ON SCHEMA public FROM ${ANON_ROLE}, ${AUTHENTICATED_ROLE}`);
}

/** Grant the restricted roles access to one project schema. Idempotent. */
export async function grantProjectSchema(client: PoolClient, schema: string): Promise<void> {
  if (!SCHEMA_RE.test(schema)) throw new Error(`Invalid project schema: ${schema}`);
  const roles = `${ANON_ROLE}, ${AUTHENTICATED_ROLE}`;
  await client.query(`GRANT USAGE ON SCHEMA "${schema}" TO ${roles}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO ${roles}`);
  await client.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA "${schema}" TO ${roles}`);
  await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "${schema}" TO ${roles}`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${roles}`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT USAGE ON SEQUENCES TO ${roles}`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT EXECUTE ON FUNCTIONS TO ${roles}`);
  for (const table of PROTECTED_TABLES) {
    await client.query(
      `DO $$ BEGIN
         IF to_regclass('"${schema}"."${table}"') IS NOT NULL THEN
           REVOKE ALL ON "${schema}"."${table}" FROM ${roles};
         END IF;
       END $$`
    );
  }
}
