import { getProjectPool, getProjectSchema } from "@/lib/project-db";

/**
 * Resolve a batch of user ids to emails from a project's own auth schema.
 * userId on audit_logs is a soft reference — users live in per-project
 * databases, not alongside the audit log rows — so this always needs a
 * second query.
 */
export async function resolveUserEmails(
  projectId: string,
  databaseUrl: string | null,
  userIds: string[]
): Promise<Map<string, string>> {
  const emailById = new Map<string, string>();
  if (userIds.length === 0) return emailById;

  const schema = getProjectSchema(projectId);
  const pool = getProjectPool(databaseUrl);
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, email FROM "${schema}"."users" WHERE id = ANY($1::uuid[])`,
      [userIds]
    );
    for (const u of rows) emailById.set(u.id, u.email);
  } catch {
    // Table may not exist yet for a fresh project — fall back to no emails
  } finally {
    client.release();
  }
  return emailById;
}
