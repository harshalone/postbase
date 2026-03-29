import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sqlQueries } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// PATCH /api/dashboard/[projectId]/sql/history/[queryId] — update name or visibility
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; queryId: string }> }
) {
  const { projectId, queryId } = await params;

  const body = await req.json() as { name?: string; visibility?: string };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name?.trim() || null;
  if (body.visibility !== undefined) {
    if (!["private", "shared", "favorite"].includes(body.visibility)) {
      return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
    }
    updates.visibility = body.visibility;
  }

  const [row] = await db
    .update(sqlQueries)
    .set(updates)
    .where(and(eq(sqlQueries.id, queryId), eq(sqlQueries.projectId, projectId)))
    .returning();

  if (!row) return NextResponse.json({ error: "Query not found" }, { status: 404 });
  return NextResponse.json({ query: row });
}

// DELETE /api/dashboard/[projectId]/sql/history/[queryId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; queryId: string }> }
) {
  const { projectId, queryId } = await params;

  await db
    .delete(sqlQueries)
    .where(and(eq(sqlQueries.id, queryId), eq(sqlQueries.projectId, projectId)));

  return NextResponse.json({ ok: true });
}
