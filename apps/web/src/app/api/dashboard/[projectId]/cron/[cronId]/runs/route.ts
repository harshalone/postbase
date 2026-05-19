import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, cronJobs, cronJobRuns } from "@/lib/db/schema";
import { eq, and, desc, count, gte, lte, inArray } from "drizzle-orm";

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

  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const conditions = [eq(cronJobRuns.jobId, cronId)];
  if (fromParam) conditions.push(gte(cronJobRuns.startTime, new Date(fromParam)));
  if (toParam) {
    const toDate = new Date(toParam);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(cronJobRuns.startTime, toDate));
  }

  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(cronJobRuns)
    .where(where);

  const runs = await db
    .select()
    .from(cronJobRuns)
    .where(where)
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

export async function DELETE(
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
    .select({ id: cronJobs.id })
    .from(cronJobs)
    .where(and(eq(cronJobs.id, cronId), eq(cronJobs.projectId, projectId)))
    .limit(1);
  if (!job) return NextResponse.json({ error: "Cron job not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { ids, from, to, deleteAll } = body as {
    ids?: string[];
    from?: string;
    to?: string;
    deleteAll?: boolean;
  };

  if (ids && ids.length > 0) {
    await db
      .delete(cronJobRuns)
      .where(and(eq(cronJobRuns.jobId, cronId), inArray(cronJobRuns.id, ids)));
    return NextResponse.json({ deleted: ids.length });
  }

  if (deleteAll) {
    const conditions = [eq(cronJobRuns.jobId, cronId)];
    if (from) conditions.push(gte(cronJobRuns.startTime, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(cronJobRuns.startTime, toDate));
    }
    const deleted = await db
      .delete(cronJobRuns)
      .where(and(...conditions))
      .returning({ id: cronJobRuns.id });
    return NextResponse.json({ deleted: deleted.length });
  }

  return NextResponse.json({ error: "Specify ids, deleteAll, or date range" }, { status: 400 });
}
