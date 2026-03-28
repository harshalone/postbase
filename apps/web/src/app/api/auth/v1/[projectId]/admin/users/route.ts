/**
 * GET  /api/auth/v1/[projectId]/admin/users   — list users (service role only)
 * POST /api/auth/v1/[projectId]/admin/users   — create user (service role only)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { validateApiKey } from "@/lib/auth/keys";

async function requireServiceRole(req: NextRequest, projectId: string) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const keyInfo = await validateApiKey(authHeader.slice(7), projectId);
  if (!keyInfo || keyInfo.type !== "service_role") return null;
  return keyInfo;
}

function formatUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    emailVerified: !!user.emailVerified,
    phone: user.phone,
    metadata: user.metadata,
    bannedAt: user.bannedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
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

  const [{ total }] = await db
    .select({ total: count() })
    .from(users)
    .where(eq(users.projectId, keyInfo.projectId));

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.projectId, keyInfo.projectId))
    .limit(perPage)
    .offset(offset)
    .orderBy(users.createdAt);

  return Response.json({ users: rows.map(formatUser), total });
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

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.projectId, keyInfo.projectId), eq(users.email, email)))
    .limit(1);

  if (existing) return Response.json({ error: "User already exists" }, { status: 422 });

  const [user] = await db
    .insert(users)
    .values({
      projectId: keyInfo.projectId,
      email,
      passwordHash: password ? await hash(password, 12) : null,
      emailVerified: email_confirm ? new Date() : null,
      metadata: user_metadata ?? {},
    })
    .returning();

  return Response.json({ user: formatUser(user) }, { status: 201 });
}
