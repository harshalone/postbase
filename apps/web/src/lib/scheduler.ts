import * as nodeCron from "node-cron";
import { db } from "@/lib/db";
import { cronJobs, cronJobRuns, projects } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getProjectPool, getProjectSchema } from "@/lib/project-db";

type ScheduledTask = nodeCron.ScheduledTask;

const HTTP_PREFIX = "__http__:";

type HttpJobConfig = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
};

// Map of jobId → active node-cron task
const tasks = new Map<string, ScheduledTask>();

async function runHttpJob(cfg: HttpJobConfig): Promise<string> {
  const init: RequestInit = {
    method: cfg.method,
    headers: cfg.headers,
  };
  if (cfg.body && cfg.method !== "GET" && cfg.method !== "DELETE") {
    init.body = cfg.body;
  }
  const res = await fetch(cfg.url, init);
  return `${res.status} ${res.statusText}`;
}

async function runJob(
  jobId: string,
  projectId: string,
  command: string,
  databaseUrl: string | null
) {
  const [run] = await db
    .insert(cronJobRuns)
    .values({ jobId, status: "running" })
    .returning({ id: cronJobRuns.id });

  let status: "succeeded" | "failed" = "succeeded";
  let returnMessage: string | null = null;

  try {
    if (command.startsWith(HTTP_PREFIX)) {
      const cfg = JSON.parse(command.slice(HTTP_PREFIX.length)) as HttpJobConfig;
      returnMessage = await runHttpJob(cfg);
    } else {
      const pool = getProjectPool(databaseUrl);
      const client = await pool.connect();
      try {
        const schema = getProjectSchema(projectId);
        await client.query(`SET LOCAL search_path TO "${schema}", public`);
        await client.query(command);
      } finally {
        client.release();
      }
    }
  } catch (err) {
    status = "failed";
    returnMessage = err instanceof Error ? err.message : String(err);
  }

  await db
    .update(cronJobRuns)
    .set({ status, returnMessage, endTime: new Date() })
    .where(eq(cronJobRuns.id, run.id));

  // Prune runs older than the last 100 for this job
  const allRuns = await db
    .select({ id: cronJobRuns.id })
    .from(cronJobRuns)
    .where(eq(cronJobRuns.jobId, jobId))
    .orderBy(cronJobRuns.startTime)
    .limit(1000);

  if (allRuns.length > 100) {
    const toDelete = allRuns.slice(0, allRuns.length - 100).map((r) => r.id);
    await db.delete(cronJobRuns).where(inArray(cronJobRuns.id, toDelete));
  }
}

export function scheduleJob(
  jobId: string,
  projectId: string,
  schedule: string,
  command: string,
  databaseUrl: string | null
) {
  unscheduleJob(jobId);

  if (!nodeCron.validate(schedule)) {
    console.error(`[scheduler] invalid cron expression for job ${jobId}: ${schedule}`);
    return;
  }

  const task = nodeCron.schedule(schedule, () => {
    runJob(jobId, projectId, command, databaseUrl).catch((err) =>
      console.error(`[scheduler] job ${jobId} runner error:`, err)
    );
  });

  tasks.set(jobId, task);
}

export function unscheduleJob(jobId: string) {
  const existing = tasks.get(jobId);
  if (existing) {
    existing.stop();
    tasks.delete(jobId);
  }
}

export async function loadAllJobs() {
  for (const [, task] of tasks) {
    task.stop();
  }
  tasks.clear();

  const activeJobs = await db
    .select({
      id: cronJobs.id,
      projectId: cronJobs.projectId,
      schedule: cronJobs.schedule,
      command: cronJobs.command,
    })
    .from(cronJobs)
    .where(eq(cronJobs.active, true));

  if (activeJobs.length === 0) {
    console.log("[scheduler] no active cron jobs to load");
    return;
  }

  const projectIds = [...new Set(activeJobs.map((j) => j.projectId))];
  const projectRows = await db
    .select({ id: projects.id, databaseUrl: projects.databaseUrl })
    .from(projects)
    .where(inArray(projects.id, projectIds));

  const dbUrlMap = new Map(projectRows.map((p) => [p.id, p.databaseUrl]));

  for (const job of activeJobs) {
    scheduleJob(job.id, job.projectId, job.schedule, job.command, dbUrlMap.get(job.projectId) ?? null);
  }

  console.log(`[scheduler] loaded ${activeJobs.length} active cron job(s)`);
}
