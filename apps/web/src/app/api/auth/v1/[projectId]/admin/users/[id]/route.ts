/**
 * GET   /api/auth/v1/[projectId]/admin/users/[id]   — get user by id
 * PATCH /api/auth/v1/[projectId]/admin/users/[id]   — update user
 * DELETE /api/auth/v1/[projectId]/admin/users/[id]  — delete user (cascades sessions)
 *
 * All require service role key.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { validateApiKey } from "@/lib/auth/keys";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";

async function requireServiceRole(req: NextRequest, projectId: string) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const keyInfo = await validateApiKey(authHeader.slice(7), projectId);
  if (!keyInfo || keyInfo.type !== "service_role") return null;
  return keyInfo;
}

function formatUser(user: Record<string, unknown>) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    emailVerified: !!user.email_verified,
    phone: user.phone,
    metadata: user.metadata,
    bannedAt: user.banned_at ? new Date(user.banned_at as string).toISOString() : null,
    createdAt: new Date(user.created_at as string).toISOString(),
    updatedAt: new Date(user.updated_at as string).toISOString(),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const { projectId, id } = await params;
  const keyInfo = await requireServiceRole(req, projectId);
  if (!keyInfo) return Response.json({ error: "Service role key required" }, { status: 403 });

  const schema = getProjectSchema(keyInfo.projectId);
  const pool = getProjectPool();
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);
    const { rows: [user] } = await client.query(
      `SELECT * FROM "${schema}"."users" WHERE "id" = $1 LIMIT 1`,
      [id]
    );
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });
    return Response.json({ user: formatUser(user) });
  } finally {
    client.release();
  }
}

const updateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  user_metadata: z.record(z.unknown()).optional(),
  ban: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const { projectId, id } = await params;
  const keyInfo = await requireServiceRole(req, projectId);
  if (!keyInfo) return Response.json({ error: "Service role key required" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const schema = getProjectSchema(keyInfo.projectId);
  const pool = getProjectPool();
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);

    const setClauses: string[] = [`"updated_at" = now()`];
    const values: unknown[] = [];
    let idx = 1;

    if (parsed.data.email !== undefined) { setClauses.push(`"email" = $${idx++}`); values.push(parsed.data.email); }
    if (parsed.data.password !== undefined) { setClauses.push(`"password_hash" = $${idx++}`); values.push(await hash(parsed.data.password, 12)); }
    if (parsed.data.user_metadata !== undefined) { setClauses.push(`"metadata" = $${idx++}`); values.push(JSON.stringify(parsed.data.user_metadata)); }
    if (parsed.data.ban === true) { setClauses.push(`"banned_at" = now()`); }
    if (parsed.data.ban === false) { setClauses.push(`"banned_at" = NULL`); }

    values.push(id);
    const { rows: [user] } = await client.query(
      `UPDATE "${schema}"."users" SET ${setClauses.join(", ")} WHERE "id" = $${idx} RETURNING *`,
      values
    );

    if (!user) return Response.json({ error: "User not found" }, { status: 404 });
    return Response.json({ user: formatUser(user) });
  } finally {
    client.release();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const { projectId, id } = await params;
  const keyInfo = await requireServiceRole(req, projectId);
  if (!keyInfo) return Response.json({ error: "Service role key required" }, { status: 403 });

  const schema = getProjectSchema(keyInfo.projectId);
  const pool = getProjectPool();
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);

    // Sessions are CASCADE deleted by the FK constraint on the per-project table
    const { rows: [deleted] } = await client.query(
      `DELETE FROM "${schema}"."users" WHERE "id" = $1 RETURNING id`,
      [id]
    );

    if (!deleted) return Response.json({ error: "User not found" }, { status: 404 });
    return Response.json({ message: "User deleted" });
  } finally {
    client.release();
  }
}
