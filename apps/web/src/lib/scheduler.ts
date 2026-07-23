import * as nodeCron from "node-cron";
import { db } from "@/lib/db";
import { cronJobs, cronJobRuns, projects } from "@/lib/db/schema";
import { and, eq, inArray, lt } from "drizzle-orm";
import { getProjectPool, getProjectSchema } from "@/lib/project-db";

type ScheduledTask = nodeCron.ScheduledTask;

const HTTP_PREFIX = "__http__:";
const MAX_STORED_RESPONSE_BODY_BYTES = 64 * 1024; // 64KB

type HttpJobConfig = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
};

// Map of jobId → active node-cron task
const tasks = new Map<string, ScheduledTask>();

// Set of jobIds currently mid-run, to skip overlapping ticks
const runningJobs = new Set<string>();

async function runHttpJob(cfg: HttpJobConfig): Promise<{ statusLine: string; body: string }> {
  const init: RequestInit = {
    method: cfg.method,
    headers: cfg.headers,
  };
  if (cfg.body && cfg.method !== "GET" && cfg.method !== "DELETE") {
    init.body = cfg.body;
  }
  const res = await fetch(cfg.url, init);
  const rawBody = await res.text();
  const body =
    rawBody.length > MAX_STORED_RESPONSE_BODY_BYTES
      ? `${rawBody.slice(0, MAX_STORED_RESPONSE_BODY_BYTES)}\n...[truncated, ${rawBody.length} bytes total]`
      : rawBody;
  const statusLine = `${res.status} ${res.statusText}`;
  if (!res.ok) {
    const err = new Error(statusLine) as Error & { statusLine: string; body: string };
    err.statusLine = statusLine;
    err.body = body;
    throw err;
  }
  return { statusLine, body };
}

async function runJob(
  jobId: string,
  projectId: string,
  command: string,
  databaseUrl: string | null,
  retentionDays: number | null
) {
  const [run] = await db
    .insert(cronJobRuns)
    .values({ jobId, status: "running" })
    .returning({ id: cronJobRuns.id });

  let status: "succeeded" | "failed" = "succeeded";
  let returnMessage: string | null = null;
  let responseBody: string | null = null;

  try {
    if (command.startsWith(HTTP_PREFIX)) {
      const cfg = JSON.parse(command.slice(HTTP_PREFIX.length)) as HttpJobConfig;
      const result = await runHttpJob(cfg);
      returnMessage = result.statusLine;
      responseBody = result.body;
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
    if (err instanceof Error && "statusLine" in err) {
      const httpErr = err as Error & { statusLine: string; body: string };
      returnMessage = httpErr.statusLine;
      responseBody = httpErr.body;
    } else {
      returnMessage = err instanceof Error ? err.message : String(err);
    }
  }

  await db
    .update(cronJobRuns)
    .set({ status, returnMessage, responseBody, endTime: new Date() })
    .where(eq(cronJobRuns.id, run.id));

  if (retentionDays !== null && retentionDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    await db
      .delete(cronJobRuns)
      .where(and(eq(cronJobRuns.jobId, jobId), lt(cronJobRuns.startTime, cutoff)));
  }
}

export function scheduleJob(
  jobId: string,
  projectId: string,
  schedule: string,
  command: string,
  databaseUrl: string | null,
  retentionDays: number | null = null
) {
  unscheduleJob(jobId);

  if (!nodeCron.validate(schedule)) {
    console.error(`[scheduler] invalid cron expression for job ${jobId}: ${schedule}`);
    return;
  }

  const task = nodeCron.schedule(schedule, () => {
    if (runningJobs.has(jobId)) {
      console.warn(`[scheduler] job ${jobId} skipped tick — previous run still in progress`);
      return;
    }
    runningJobs.add(jobId);
    runJob(jobId, projectId, command, databaseUrl, retentionDays)
      .catch((err) => console.error(`[scheduler] job ${jobId} runner error:`, err))
      .finally(() => runningJobs.delete(jobId));
  });

  tasks.set(jobId, task);
}

export function _debugTaskCount(): number {
  return tasks.size;
}

export function _debugRunningJobCount(): number {
  return runningJobs.size;
}

export function unscheduleJob(jobId: string) {
  const existing = tasks.get(jobId);
  if (existing) {
    existing.stop();
    tasks.delete(jobId);
  }
  runningJobs.delete(jobId);
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
      retentionDays: cronJobs.retentionDays,
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
    scheduleJob(job.id, job.projectId, job.schedule, job.command, dbUrlMap.get(job.projectId) ?? null, job.retentionDays);
  }

  console.log(`[scheduler] loaded ${activeJobs.length} active cron job(s)`);
}
