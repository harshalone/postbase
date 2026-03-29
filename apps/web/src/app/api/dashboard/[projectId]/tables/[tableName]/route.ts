import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, getProjectSchema, ensureProjectSchema } from "@/lib/project-db";

async function getProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return project ?? null;
}

// GET /api/dashboard/[projectId]/tables/[tableName]?page=0&limit=50
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; tableName: string }> }
) {
  const { projectId, tableName } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 500);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const { rows } = await client.query(
      `SELECT * FROM "${schema}"."${tableName}" LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const { rows: [{ count }] } = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${schema}"."${tableName}"`
    );
    return NextResponse.json({ rows, total: count });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// POST /api/dashboard/[projectId]/tables/[tableName] — insert row
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; tableName: string }> }
) {
  const { projectId, tableName } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const row = await req.json() as Record<string, unknown>;
  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const keys = Object.keys(row);
    const vals = Object.values(row);
    const cols = keys.map((k) => `"${k}"`).join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const { rows: [inserted] } = await client.query(
      `INSERT INTO "${schema}"."${tableName}" (${cols}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    return NextResponse.json({ row: inserted });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// PATCH /api/dashboard/[projectId]/tables/[tableName] — update row
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; tableName: string }> }
) {
  const { projectId, tableName } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { where, set } = await req.json() as {
    where: Record<string, unknown>;
    set: Record<string, unknown>;
  };
  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const vals: unknown[] = [];
    const setClauses = Object.entries(set).map(([k, v]) => {
      vals.push(v);
      return `"${k}" = $${vals.length}`;
    });
    const whereClauses = Object.entries(where).map(([k, v]) => {
      vals.push(v);
      return `"${k}" = $${vals.length}`;
    });
    const { rows: [updated] } = await client.query(
      `UPDATE "${schema}"."${tableName}" SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")} RETURNING *`,
      vals
    );
    return NextResponse.json({ row: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE /api/dashboard/[projectId]/tables/[tableName] — delete row
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; tableName: string }> }
) {
  const { projectId, tableName } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { where } = await req.json() as { where: Record<string, unknown> };
  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const vals: unknown[] = [];
    const whereClauses = Object.entries(where).map(([k, v]) => {
      vals.push(v);
      return `"${k}" = $${vals.length}`;
    });
    await client.query(
      `DELETE FROM "${schema}"."${tableName}" WHERE ${whereClauses.join(" AND ")}`,
      vals
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
