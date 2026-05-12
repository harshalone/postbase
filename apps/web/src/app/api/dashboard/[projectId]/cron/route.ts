import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, cronJobs, cronJobRuns } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { scheduleJob, unscheduleJob } from "@/lib/scheduler";
import * as nodeCron from "node-cron";

async function getProject(projectId: string) {
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return p ?? null;
}

// GET /api/dashboard/[projectId]/cron
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const jobs = await db
    .select()
    .from(cronJobs)
    .where(eq(cronJobs.projectId, projectId))
    .orderBy(cronJobs.createdAt);

  const jobsWithRuns = await Promise.all(
    jobs.map(async (job) => {
      const runs = await db
        .select()
        .from(cronJobRuns)
        .where(eq(cronJobRuns.jobId, job.id))
        .orderBy(desc(cronJobRuns.startTime))
        .limit(5);
      return {
        jobid: job.id,
        jobname: job.name,
        schedule: job.schedule,
        command: job.command,
        active: job.active,
        runs: runs.map((r) => ({
          start_time: r.startTime,
          end_time: r.endTime,
          status: r.status,
          return_message: r.returnMessage,
        })),
      };
    })
  );

  return NextResponse.json({ installed: true, jobs: jobsWithRuns });
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
    jobId?: string;
    active?: boolean;
  };

  try {
    if (body.action === "install") {
      // node-cron needs no installation — it's always available
      return NextResponse.json({ ok: true });
    }

    if (body.action === "create") {
      if (!body.jobName || !body.schedule || !body.command) {
        return NextResponse.json({ error: "jobName, schedule, command required" }, { status: 400 });
      }
      if (!nodeCron.validate(body.schedule)) {
        return NextResponse.json({ error: `Invalid cron expression: ${body.schedule}` }, { status: 400 });
      }

      // Ensure name is unique within this project
      const existing = await db
        .select({ id: cronJobs.id })
        .from(cronJobs)
        .where(and(eq(cronJobs.projectId, projectId), eq(cronJobs.name, body.jobName)))
        .limit(1);
      if (existing.length > 0) {
        return NextResponse.json({ error: `A job named "${body.jobName}" already exists` }, { status: 400 });
      }

      const [job] = await db
        .insert(cronJobs)
        .values({
          projectId,
          name: body.jobName,
          schedule: body.schedule,
          command: body.command,
          active: true,
        })
        .returning();

      scheduleJob(job.id, projectId, job.schedule, job.command, project.databaseUrl);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "toggle") {
      if (!body.jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

      const [job] = await db
        .update(cronJobs)
        .set({ active: body.active, updatedAt: new Date() })
        .where(and(eq(cronJobs.id, body.jobId), eq(cronJobs.projectId, projectId)))
        .returning();

      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

      if (job.active) {
        scheduleJob(job.id, projectId, job.schedule, job.command, project.databaseUrl);
      } else {
        unscheduleJob(job.id);
      }

      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      if (!body.jobName) return NextResponse.json({ error: "jobName required" }, { status: 400 });

      const [job] = await db
        .select()
        .from(cronJobs)
        .where(and(eq(cronJobs.projectId, projectId), eq(cronJobs.name, body.jobName)))
        .limit(1);

      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

      unscheduleJob(job.id);
      await db.delete(cronJobs).where(eq(cronJobs.id, job.id));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
