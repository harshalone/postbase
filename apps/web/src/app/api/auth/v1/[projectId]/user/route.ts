/**
 * GET /api/auth/v1/[projectId]/user  — get current authenticated user
 * PATCH /api/auth/v1/[projectId]/user — update current user's profile
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey } from "@/lib/auth/keys";
import { verifyJwt, getJwtSecret } from "@/lib/auth/jwt";
import { getProjectPool, getProjectSchema, ensureProjectAuthTables } from "@/lib/project-db";
import { PoolClient } from "pg";

async function resolveUser(req: NextRequest, projectId: string) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { keyInfo: null, userId: null };

  const keyInfo = await validateApiKey(authHeader.slice(7), projectId);
  if (!keyInfo) return { keyInfo: null, userId: null };

  const token = req.headers.get("x-postbase-token");
  if (!token) return { keyInfo, userId: null };

  const secret = getJwtSecret();
  const payload = await verifyJwt(token, secret);
  if (!payload || payload.pid !== keyInfo.projectId) return { keyInfo, userId: null };

  return { keyInfo, userId: payload.sub };
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
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { keyInfo, userId } = await resolveUser(req, projectId);
  if (!keyInfo) return Response.json({ error: "Missing API key" }, { status: 401 });
  if (!userId) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const schema = getProjectSchema(keyInfo.projectId);
  const pool = getProjectPool();
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);
    const { rows: [user] } = await client.query(
      `SELECT * FROM "${schema}"."users" WHERE "id" = $1 LIMIT 1`,
      [userId]
    );
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });
    return Response.json({ user: formatUser(user) });
  } finally {
    client.release();
  }
}

const updateSchema = z.object({
  name: z.string().optional(),
  image: z.string().url().optional(),
  data: z.record(z.unknown()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { keyInfo, userId } = await resolveUser(req, projectId);
  if (!keyInfo) return Response.json({ error: "Missing API key" }, { status: 401 });
  if (!userId) return Response.json({ error: "Not authenticated" }, { status: 401 });

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

    if (parsed.data.name !== undefined) { setClauses.push(`"name" = $${idx++}`); values.push(parsed.data.name); }
    if (parsed.data.image !== undefined) { setClauses.push(`"image" = $${idx++}`); values.push(parsed.data.image); }
    if (parsed.data.data !== undefined) { setClauses.push(`"metadata" = $${idx++}`); values.push(JSON.stringify(parsed.data.data)); }

    values.push(userId);
    const { rows: [user] } = await client.query(
      `UPDATE "${schema}"."users" SET ${setClauses.join(", ")} WHERE "id" = $${idx} RETURNING *`,
      values
    );

    return Response.json({ user: formatUser(user) });
  } finally {
    client.release();
  }
}
