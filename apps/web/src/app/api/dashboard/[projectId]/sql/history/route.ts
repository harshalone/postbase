import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, sqlQueries } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

// GET /api/dashboard/[projectId]/sql/history — list saved queries
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(sqlQueries)
    .where(eq(sqlQueries.projectId, projectId))
    .orderBy(desc(sqlQueries.executedAt))
    .limit(200);

  return NextResponse.json({ queries: rows });
}

// POST /api/dashboard/[projectId]/sql/history — save a new query
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json() as { sql: string; name?: string; visibility?: string };
  if (!body.sql?.trim()) return NextResponse.json({ error: "sql is required" }, { status: 400 });

  const visibility = body.visibility ?? "private";
  if (!["private", "shared", "favorite"].includes(visibility)) {
    return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  }

  const [row] = await db
    .insert(sqlQueries)
    .values({
      projectId,
      sql: body.sql.trim(),
      name: body.name?.trim() || null,
      visibility,
    })
    .returning();

  return NextResponse.json({ query: row });
}
