import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, ensureProjectSchema } from "@/lib/project-db";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// POST /api/dashboard/[projectId]/csv-import
// Body: { tableName: string; rows: Record<string, string>[]; columns: string[] }
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

  const body = await req.json() as {
    tableName: string;
    rows: Record<string, string>[];
    columns: string[];
  };

  const { tableName, rows, columns } = body;
  if (!tableName?.trim()) return NextResponse.json({ error: "tableName is required" }, { status: 400 });
  if (!Array.isArray(columns) || columns.length === 0) return NextResponse.json({ error: "columns is required" }, { status: 400 });
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: "rows is required" }, { status: 400 });

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);

    // Validate table exists in schema
    const { rows: tableCheck } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
      [schema, tableName]
    );
    if (tableCheck.length === 0) {
      return NextResponse.json({ error: `Table "${tableName}" not found in project schema` }, { status: 400 });
    }

    // Validate columns exist in table
    const { rows: colRows } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
      [schema, tableName]
    );
    const validCols = new Set(colRows.map((r: { column_name: string }) => r.column_name));
    const invalidCols = columns.filter((c) => !validCols.has(c));
    if (invalidCols.length > 0) {
      return NextResponse.json({ error: `Unknown column(s): ${invalidCols.join(", ")}` }, { status: 400 });
    }

    // Build parameterized INSERT ... ON CONFLICT DO NOTHING
    const quotedTable = `"${schema}"."${tableName}"`;
    const quotedCols = columns.map((c) => `"${c}"`).join(", ");

    await client.query("BEGIN");
    let inserted = 0;
    try {
      for (const row of rows) {
        const values = columns.map((c) => {
          const v = row[c];
          return v === "" || v === null || v === undefined ? null : v;
        });
        const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
        await client.query(
          `INSERT INTO ${quotedTable} (${quotedCols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
        inserted++;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    return NextResponse.json({ inserted, total: rows.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  } finally {
    client.release();
  }
}
