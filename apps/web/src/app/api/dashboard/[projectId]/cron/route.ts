import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool, getProjectSchema } from "@/lib/project-db";

async function getProject(projectId: string) {
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return p ?? null;
}

// GET /api/dashboard/[projectId]/cron — list all cron jobs for this project
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    // Check if pg_cron is installed
    const { rows: extRows } = await client.query(
      `SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'`
    );
    if (extRows.length === 0) return NextResponse.json({ installed: false, jobs: [] });

    const { rows: loadedRows } = await client.query(
      `SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'`
    );
    if (loadedRows.length === 0) return NextResponse.json({ installed: false, jobs: [] });

    const prefix = `pb_${projectId.replace(/-/g, "")}_`;
    const { rows: jobs } = await client.query(
      `SELECT jobid, jobname, schedule, command, nodename, nodeport, database, username, active
       FROM cron.job WHERE jobname LIKE $1 ORDER BY jobid`,
      [`${prefix}%`]
    );

    // Fetch last run details per job
    const jobsWithHistory = await Promise.all(
      jobs.map(async (job) => {
        const { rows: runs } = await client.query(
          `SELECT start_time, end_time, status, return_message
           FROM cron.job_run_details WHERE jobid = $1 ORDER BY start_time DESC LIMIT 5`,
          [job.jobid]
        );
        return { ...job, runs };
      })
    );

    return NextResponse.json({ installed: true, jobs: jobsWithHistory });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}

// POST /api/dashboard/[projectId]/cron
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json() as {
    action: "install" | "create" | "toggle" | "delete";
    jobName?: string;
    schedule?: string;
    command?: string;
    jobId?: number;
    active?: boolean;
  };

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    if (body.action === "install") {
      await client.query(`CREATE EXTENSION IF NOT EXISTS pg_cron`);
      return NextResponse.json({ ok: true });
    }

    const prefix = `pb_${projectId.replace(/-/g, "")}_`;

    if (body.action === "create") {
      if (!body.jobName || !body.schedule || !body.command) {
        return NextResponse.json({ error: "jobName, schedule, command required" }, { status: 400 });
      }
      const fullName = `${prefix}${body.jobName}`;
      const schema = getProjectSchema(projectId);
      // Prefix search_path so unqualified table names resolve correctly
      const wrappedCmd = `SET search_path TO "${schema}", public; ${body.command}`;
      await client.query(
        `SELECT cron.schedule($1, $2, $3)`,
        [fullName, body.schedule, wrappedCmd]
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "toggle") {
      if (!body.jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
      await client.query(
        `UPDATE cron.job SET active = $1 WHERE jobid = $2`,
        [body.active, body.jobId]
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      if (!body.jobName) return NextResponse.json({ error: "jobName required" }, { status: 400 });
      const fullName = `${prefix}${body.jobName}`;
      await client.query(`SELECT cron.unschedule($1)`, [fullName]);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  } finally {
    client.release();
    await pool.end();
  }
}
