import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, ensureProjectSchema } from "@/lib/project-db";

async function getProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return project ?? null;
}

// POST /api/dashboard/[projectId]/tables/[tableName]/columns — add column
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; tableName: string }> }
) {
  const { projectId, tableName } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { name, type, isArray, defaultValue, isPrimaryKey } = await req.json() as {
    name: string;
    type: string;
    isArray?: boolean;
    defaultValue?: string;
    isPrimaryKey?: boolean;
  };

  if (!name?.trim() || !type?.trim()) {
    return NextResponse.json({ error: "name and type are required" }, { status: 400 });
  }

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const colType = `${type}${isArray ? "[]" : ""}`;
    const parts = [`ALTER TABLE "${schema}"."${tableName}" ADD COLUMN "${name}" ${colType}`];
    if (defaultValue?.trim()) parts.push(`DEFAULT ${defaultValue}`);
    if (isPrimaryKey) parts.push("PRIMARY KEY");
    await client.query(parts.join(" "));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}
