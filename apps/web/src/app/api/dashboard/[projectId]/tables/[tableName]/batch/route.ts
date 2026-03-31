import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, ensureProjectSchema } from "@/lib/project-db";

async function getProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return project ?? null;
}

// POST /api/dashboard/[projectId]/tables/[tableName]/batch
// Body: { rows: Record<string, unknown>[] }
// Inserts all rows in a single transaction. Returns { inserted, errors }.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; tableName: string }> }
) {
  const { projectId, tableName } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json() as { rows: Record<string, unknown>[] };
  const { rows } = body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows must be a non-empty array" }, { status: 400 });
  }

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  let inserted = 0;
  const errors: string[] = [];

  try {
    const schema = await ensureProjectSchema(client, projectId);
    await client.query("BEGIN");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const keys = Object.keys(row);
      if (keys.length === 0) continue;
      const vals = Object.values(row);
      const cols = keys.map((k) => `"${k}"`).join(", ");
      const placeholders = keys.map((_, j) => `$${j + 1}`).join(", ");
      await client.query(`SAVEPOINT row_${i}`);
      try {
        await client.query(
          `INSERT INTO "${schema}"."${tableName}" (${cols}) VALUES (${placeholders})`,
          vals
        );
        inserted++;
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT row_${i}`);
        errors.push(`Row ${i + 1}: ${String(err)}`);
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => null);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ inserted, errors });
}

// DELETE /api/dashboard/[projectId]/tables/[tableName]/batch
// Body: { pkCol: string, ids: (string | number)[] }
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; tableName: string }> }
) {
  const { projectId, tableName } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { pkCol, ids } = await req.json() as { pkCol: string; ids: (string | number)[] };
  if (!pkCol || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "pkCol and non-empty ids array are required" }, { status: 400 });
  }

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const result = await client.query(
      `DELETE FROM "${schema}"."${tableName}" WHERE "${pkCol}" IN (${placeholders})`,
      ids
    );
    return NextResponse.json({ ok: true, rowCount: result.rowCount, schema, tableName, pkCol });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
