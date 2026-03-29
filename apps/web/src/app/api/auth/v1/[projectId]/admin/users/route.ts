/**
 * GET  /api/auth/v1/[projectId]/admin/users   — list users (service role only)
 * POST /api/auth/v1/[projectId]/admin/users   — create user (service role only)
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const keyInfo = await requireServiceRole(req, projectId);
  if (!keyInfo) return Response.json({ error: "Service role key required" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") ?? "50", 10)));
  const offset = (page - 1) * perPage;

  const schema = getProjectSchema(keyInfo.projectId);
  const pool = getProjectPool();
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);

    const { rows: [{ total }] } = await client.query(
      `SELECT COUNT(*)::int AS total FROM "${schema}"."users"`
    );
    const { rows } = await client.query(
      `SELECT * FROM "${schema}"."users" ORDER BY "created_at" LIMIT $1 OFFSET $2`,
      [perPage, offset]
    );

    return Response.json({ users: rows.map(formatUser), total });
  } finally {
    client.release();
  }
}

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).optional(),
  email_confirm: z.boolean().optional(),
  user_metadata: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const keyInfo = await requireServiceRole(req, projectId);
  if (!keyInfo) return Response.json({ error: "Service role key required" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, password, email_confirm, user_metadata } = parsed.data;

  const schema = getProjectSchema(keyInfo.projectId);
  const pool = getProjectPool();
  const client = await pool.connect();
  try {
    await ensureProjectAuthTables(client, schema);

    const { rows: [existing] } = await client.query(
      `SELECT id FROM "${schema}"."users" WHERE "email" = $1 LIMIT 1`,
      [email]
    );
    if (existing) return Response.json({ error: "User already exists" }, { status: 422 });

    const passwordHash = password ? await hash(password, 12) : null;
    const emailVerified = email_confirm ? new Date() : null;

    const { rows: [user] } = await client.query(
      `INSERT INTO "${schema}"."users"
         ("email", "password_hash", "email_verified", "metadata")
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [email, passwordHash, emailVerified, JSON.stringify(user_metadata ?? {})]
    );

    return Response.json({ user: formatUser(user) }, { status: 201 });
  } finally {
    client.release();
  }
}
