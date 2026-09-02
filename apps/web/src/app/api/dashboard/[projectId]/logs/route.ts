/**
 * GET /api/dashboard/[projectId]/logs — list audit log events for the dashboard
 *
 * Query params:
 *   page, perPage — pagination
 *   action        — filter by exact action (e.g. "auth.sign_in")
 *   from, to      — ISO date range filter (inclusive, by day)
 *   search        — substring match against the action name (server-side).
 *                    User email is resolved from a separate per-project
 *                    database after pagination, so it cannot be filtered in
 *                    SQL here — the UI additionally filters the loaded page
 *                    by email client-side.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLogs, projects } from "@/lib/db/schema";
import { and, count, desc, eq, gte, lte, ilike } from "drizzle-orm";
import { resolveUserEmails } from "@/lib/resolve-user-emails";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const [project] = await db
    .select({ id: projects.id, databaseUrl: projects.databaseUrl })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") ?? "50", 10)));
  const offset = (page - 1) * perPage;
  const action = searchParams.get("action");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const search = searchParams.get("search")?.trim() ?? "";

  const conditions = [eq(auditLogs.projectId, projectId)];
  if (action) conditions.push(eq(auditLogs.action, action));
  if (fromParam) conditions.push(gte(auditLogs.createdAt, new Date(fromParam)));
  if (toParam) {
    const toDate = new Date(toParam);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(auditLogs.createdAt, toDate));
  }
  if (search) conditions.push(ilike(auditLogs.action, `%${search}%`));
  const where = and(...conditions);

  const [{ total }] = await db.select({ total: count() }).from(auditLogs).where(where);

  const rows = await db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(perPage)
    .offset(offset);

  const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))];
  const emailById = await resolveUserEmails(projectId, project.databaseUrl, userIds);

  const events = rows.map((r) => ({
    id: r.id,
    action: r.action,
    userId: r.userId,
    userEmail: r.userId ? emailById.get(r.userId) ?? null : null,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    metadata: r.metadata as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
  }));

  return Response.json({ events, total, page, perPage });
}
