import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, adminUsersToOrganisations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getProjectPool, ensureProjectSchema } from "@/lib/project-db";
import { auth } from "@/lib/auth/admin";

// POST /api/dashboard/[projectId]/sql — execute arbitrary SQL in project schema
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  
  // 1. Authenticate the dashboard session
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as { id: string; totpEnabled?: boolean; totpVerified?: boolean };

  // 2. Enforce TOTP if enabled
  if (user.totpEnabled && !user.totpVerified) {
    return NextResponse.json({ error: "TOTP verification required" }, { status: 403 });
  }

  // 3. Fetch project and check if it exists
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // 4. Verify user has permission to this project's organisation
  if (!project.organisationId) {
    return NextResponse.json({ error: "Project has no assigned organisation" }, { status: 403 });
  }

  const [access] = await db
    .select()
    .from(adminUsersToOrganisations)
    .where(
      and(
        eq(adminUsersToOrganisations.adminUserId, user.id),
        eq(adminUsersToOrganisations.organisationId, project.organisationId)
      )
    )
    .limit(1);

  if (!access) {
    return NextResponse.json({ error: "You do not have permission to access this project" }, { status: 403 });
  }

  const { sql } = await req.json() as { sql: string };
  if (!sql?.trim()) return NextResponse.json({ error: "sql is required" }, { status: 400 });

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    const schema = await ensureProjectSchema(client, projectId);
    // Wrap in a transaction so SET LOCAL search_path is scoped to this query only.
    // This prevents the search_path from leaking to other requests on the same connection.
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    const result = await client.query(sql);
    await client.query("COMMIT");
    return NextResponse.json({
      rows: result.rows,
      fields: result.fields?.map((f) => ({ name: f.name })) ?? [],
      rowCount: result.rowCount,
      command: result.command,
      schema,
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    return NextResponse.json({ error: String(err) }, { status: 400 });
  } finally {
    client.release();
  }
}
