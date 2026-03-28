/**
 * GET /api/dashboard/[projectId]/users — list users for the dashboard (session-authed)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") ?? "50", 10)));
  const offset = (page - 1) * perPage;

  const [{ total }] = await db
    .select({ total: count() })
    .from(users)
    .where(eq(users.projectId, projectId));

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.projectId, projectId))
    .limit(perPage)
    .offset(offset)
    .orderBy(users.createdAt);

  const formatted = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    emailVerified: !!u.emailVerified,
    phone: u.phone,
    isAnonymous: u.isAnonymous,
    bannedAt: u.bannedAt?.toISOString() ?? null,
    metadata: (u.metadata ?? {}) as Record<string, unknown>,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }));

  return Response.json({ users: formatted, total, page, perPage });
}
