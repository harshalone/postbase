import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, ensureProjectSchema } from "@/lib/project-db";

async function getProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return project ?? null;
}

// DELETE /api/dashboard/[projectId]/tables/[tableName]/columns — drop column
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; tableName: string }> }
) {
  const { projectId, tableName } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { columnName } = await req.json() as { columnName: string };
  if (!columnName?.trim()) {
    return NextResponse.json({ error: "columnName is required" }, { status: 400 });
  }

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    await client.query(`ALTER TABLE "${schema}"."${tableName}" DROP COLUMN "${columnName}"`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// PATCH /api/dashboard/[projectId]/tables/[tableName]/columns — rename column
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; tableName: string }> }
) {
  const { projectId, tableName } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { columnName, newName } = await req.json() as { columnName: string; newName: string };
  if (!columnName?.trim() || !newName?.trim()) {
    return NextResponse.json({ error: "columnName and newName are required" }, { status: 400 });
  }

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    await client.query(`ALTER TABLE "${schema}"."${tableName}" RENAME COLUMN "${columnName}" TO "${newName}"`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
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
  }
}
