import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, ensureProjectSchema } from "@/lib/project-db";

// POST /api/dashboard/[projectId]/sql — execute arbitrary SQL in project schema
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { sql } = await req.json() as { sql: string };
  if (!sql?.trim()) return NextResponse.json({ error: "sql is required" }, { status: 400 });

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    // Set search_path so unqualified table names resolve to project schema
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    const result = await client.query(sql);
    return NextResponse.json({
      rows: result.rows,
      fields: result.fields?.map((f) => ({ name: f.name })) ?? [],
      rowCount: result.rowCount,
      command: result.command,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  } finally {
    client.release();
    await pool.end();
  }
}
