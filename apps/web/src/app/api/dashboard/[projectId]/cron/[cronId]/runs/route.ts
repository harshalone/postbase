import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, cronJobs, cronJobRuns } from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";

type Params = { projectId: string; cronId: string };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { projectId, cronId } = await params;

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const [job] = await db
    .select()
    .from(cronJobs)
    .where(and(eq(cronJobs.id, cronId), eq(cronJobs.projectId, projectId)))
    .limit(1);
  if (!job) return NextResponse.json({ error: "Cron job not found" }, { status: 404 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  const [{ total }] = await db
    .select({ total: count() })
    .from(cronJobRuns)
    .where(eq(cronJobRuns.jobId, cronId));

  const runs = await db
    .select()
    .from(cronJobRuns)
    .where(eq(cronJobRuns.jobId, cronId))
    .orderBy(desc(cronJobRuns.startTime))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    job: {
      id: job.id,
      name: job.name,
      schedule: job.schedule,
      command: job.command,
      active: job.active,
    },
    runs: runs.map((r) => ({
      id: r.id,
      start_time: r.startTime,
      end_time: r.endTime,
      status: r.status,
      return_message: r.returnMessage,
      response_body: r.responseBody,
    })),
    total,
    page,
    limit,
  });
}
