import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateAnonKey, generateServiceRoleKey } from "@/lib/auth/keys";
import {
  getProjectPool,
  getProjectSchema,
  ensureProjectSchema,
  ensureProjectAuthTables,
} from "@/lib/project-db";
import {
  copyTableSchemas,
  copyFunctions,
  copyTriggers,
  copyRlsPolicies,
  getTableCopyOrder,
  copyTableData,
  copyAuthTableData,
  copyProviderConfigs,
  copyEmailSettings,
  copyEmailTemplates,
  copyStorageBuckets,
  copyStorageConnections,
  copyCronJobs,
} from "@/lib/copy-project";

// ─── Request schema ───────────────────────────────────────────────────────────

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  organisationId: z.string().uuid().optional().nullable(),
  options: z.object({
    tables: z.boolean().default(true),
    functions: z.boolean().default(true),
    triggers: z.boolean().default(true),
    rls: z.boolean().default(true),
    authProviders: z.boolean().default(true),
    emailSettings: z.boolean().default(true),
    storageBuckets: z.boolean().default(true),
    storageConnections: z.boolean().default(true),
    cronJobs: z.boolean().default(true),
    copyUsers: z.boolean().default(false),
  }),
});

// ─── SSE event types ──────────────────────────────────────────────────────────

// phase events — one per major phase
export type PhaseStatus = "running" | "done" | "skipped" | "error";

export interface PhaseEvent {
  type: "phase";
  phase: string;        // e.g. "table_schemas", "functions", "data"
  status: PhaseStatus;
  message: string;
  detail?: string;      // e.g. "90 tables created, 0 failed"
  newProjectId?: string;
}

// table_data events — one per table during data copy
export interface TableDataEvent {
  type: "table_data";
  table: string;
  status: "running" | "done" | "error";
  rows?: number;
  error?: string;
}

// summary event — final event
export interface SummaryEvent {
  type: "summary";
  newProjectId: string;
  errors: string[];     // human-readable list of anything that failed
}

type CopyEvent = PhaseEvent | TableDataEvent | SummaryEvent;

function encode(event: CopyEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const body = bodySchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.flatten() }, { status: 400 });
  }
  const { name, slug, organisationId, options } = body.data;

  const [srcProject] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!srcProject) {
    return Response.json({ error: "Source project not found" }, { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const errors: string[] = [];

      function emit(event: CopyEvent) {
        controller.enqueue(encode(event));
      }

      function phase(p: string, status: PhaseStatus, message: string, detail?: string, newProjectId?: string) {
        emit({ type: "phase", phase: p, status, message, detail, newProjectId });
      }

      try {
        // ── 1. Create project record ──────────────────────────────────────────
        phase("init", "running", "Creating project…");

        const [newProject] = await db
          .insert(projects)
          .values({
            name,
            slug,
            organisationId: organisationId ?? srcProject.organisationId,
            anonKey: generateAnonKey(),
            serviceRoleKey: generateServiceRoleKey(),
          })
          .returning();

        phase("init", "done", "Project created", undefined, newProject.id);

        const pool = getProjectPool(srcProject.databaseUrl);
        const srcSchema = getProjectSchema(projectId);
        const dstSchema = getProjectSchema(newProject.id);

        // ── 2. Initialise destination schema + auth tables ────────────────────
        phase("schema_init", "running", "Initialising schema…");
        const initClient = await pool.connect();
        try {
          await ensureProjectSchema(initClient, newProject.id);
          await ensureProjectAuthTables(initClient, dstSchema);
          phase("schema_init", "done", "Schema ready");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          phase("schema_init", "error", "Failed to initialise schema", msg);
          errors.push(`Schema init: ${msg}`);
          // Can't continue without a schema
          emit({ type: "summary", newProjectId: newProject.id, errors });
          return;
        } finally {
          initClient.release();
        }

        // ── 3. Table schemas (structure, no data) ─────────────────────────────
        if (options.tables) {
          phase("table_schemas", "running", "Copying table structures…");
          const client = await pool.connect();
          try {
            const result = await copyTableSchemas(client, srcSchema, dstSchema);
            const failCount = result.failed.length;
            for (const f of result.failed) errors.push(`Table schema "${f.table}": ${f.error}`);
            phase(
              "table_schemas",
              failCount > 0 ? "error" : "done",
              failCount > 0 ? `${result.created.length} tables created, ${failCount} failed` : "Table structures copied",
              `${result.created.length} tables${failCount > 0 ? `, ${failCount} errors` : ""}`
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            phase("table_schemas", "error", "Failed to copy table structures", msg);
            errors.push(`Table schemas: ${msg}`);
          } finally {
            client.release();
          }
        } else {
          phase("table_schemas", "skipped", "Table structures skipped");
        }

        // ── 4. Functions ──────────────────────────────────────────────────────
        if (options.functions) {
          phase("functions", "running", "Copying functions…");
          const client = await pool.connect();
          try {
            const result = await copyFunctions(client, srcSchema, dstSchema);
            for (const f of result.failed) errors.push(`Function "${f.name}": ${f.error}`);
            phase(
              "functions",
              result.failed.length > 0 ? "error" : "done",
              `${result.copied} function${result.copied !== 1 ? "s" : ""} copied${result.failed.length > 0 ? `, ${result.failed.length} failed` : ""}`,
              result.failed.length > 0 ? result.failed.map((f) => f.name).join(", ") : undefined
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            phase("functions", "error", "Failed to copy functions", msg);
            errors.push(`Functions: ${msg}`);
          } finally {
            client.release();
          }
        } else {
          phase("functions", "skipped", "Functions skipped");
        }

        // ── 5. Triggers ───────────────────────────────────────────────────────
        if (options.triggers) {
          phase("triggers", "running", "Copying triggers…");
          const client = await pool.connect();
          try {
            const result = await copyTriggers(client, srcSchema, dstSchema);
            for (const f of result.failed) errors.push(`Trigger "${f.name}": ${f.error}`);
            phase(
              "triggers",
              result.failed.length > 0 ? "error" : "done",
              `${result.copied} trigger${result.copied !== 1 ? "s" : ""} copied${result.failed.length > 0 ? `, ${result.failed.length} failed` : ""}`,
              result.failed.length > 0 ? result.failed.map((f) => f.name).join(", ") : undefined
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            phase("triggers", "error", "Failed to copy triggers", msg);
            errors.push(`Triggers: ${msg}`);
          } finally {
            client.release();
          }
        } else {
          phase("triggers", "skipped", "Triggers skipped");
        }

        // ── 6. RLS policies ───────────────────────────────────────────────────
        if (options.rls) {
          phase("rls", "running", "Copying RLS policies…");
          const client = await pool.connect();
          try {
            const result = await copyRlsPolicies(client, srcSchema, dstSchema);
            for (const f of result.failed) errors.push(`RLS policy "${f.name}": ${f.error}`);
            phase(
              "rls",
              result.failed.length > 0 ? "error" : "done",
              `${result.copied} polic${result.copied !== 1 ? "ies" : "y"} copied${result.failed.length > 0 ? `, ${result.failed.length} failed` : ""}`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            phase("rls", "error", "Failed to copy RLS policies", msg);
            errors.push(`RLS: ${msg}`);
          } finally {
            client.release();
          }
        } else {
          phase("rls", "skipped", "RLS policies skipped");
        }

        // ── 7. Auth providers ─────────────────────────────────────────────────
        if (options.authProviders) {
          phase("auth_providers", "running", "Copying auth providers…");
          try {
            const count = await copyProviderConfigs(projectId, newProject.id);
            phase("auth_providers", "done", `${count} provider${count !== 1 ? "s" : ""} copied`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            phase("auth_providers", "error", "Failed to copy auth providers", msg);
            errors.push(`Auth providers: ${msg}`);
          }
        } else {
          phase("auth_providers", "skipped", "Auth providers skipped");
        }

        // ── 8. Email settings + templates ─────────────────────────────────────
        if (options.emailSettings) {
          phase("email", "running", "Copying email settings…");
          try {
            const hasSMTP = await copyEmailSettings(projectId, newProject.id);
            const templateCount = await copyEmailTemplates(projectId, newProject.id);
            phase(
              "email",
              "done",
              hasSMTP ? `Email settings + ${templateCount} template${templateCount !== 1 ? "s" : ""} copied` : `No email settings found`
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            phase("email", "error", "Failed to copy email settings", msg);
            errors.push(`Email: ${msg}`);
          }
        } else {
          phase("email", "skipped", "Email settings skipped");
        }

        // ── 9. Storage ────────────────────────────────────────────────────────
        if (options.storageBuckets || options.storageConnections) {
          phase("storage", "running", "Copying storage config…");
          try {
            const buckets = options.storageBuckets ? await copyStorageBuckets(projectId, newProject.id) : 0;
            const conns = options.storageConnections ? await copyStorageConnections(projectId, newProject.id) : 0;
            phase("storage", "done", `${buckets} bucket${buckets !== 1 ? "s" : ""}, ${conns} connection${conns !== 1 ? "s" : ""} copied`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            phase("storage", "error", "Failed to copy storage config", msg);
            errors.push(`Storage: ${msg}`);
          }
        } else {
          phase("storage", "skipped", "Storage config skipped");
        }

        // ── 10. Cron jobs ─────────────────────────────────────────────────────
        if (options.cronJobs) {
          phase("cron_jobs", "running", "Copying cron jobs…");
          try {
            const count = await copyCronJobs(projectId, newProject.id);
            phase("cron_jobs", "done", `${count} job${count !== 1 ? "s" : ""} copied`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            phase("cron_jobs", "error", "Failed to copy cron jobs", msg);
            errors.push(`Cron jobs: ${msg}`);
          }
        } else {
          phase("cron_jobs", "skipped", "Cron jobs skipped");
        }

        // ── 11. Users (opt-in) ────────────────────────────────────────────────
        if (options.copyUsers) {
          phase("users", "running", "Copying users…");
          const client = await pool.connect();
          try {
            const results = await copyAuthTableData(client, srcSchema, dstSchema);
            const failed = results.filter((r) => r.error);
            for (const r of failed) errors.push(`Users "${r.table}": ${r.error}`);
            const totalRows = results.reduce((s, r) => s + r.rows, 0);
            phase(
              "users",
              failed.length > 0 ? "error" : "done",
              `${totalRows.toLocaleString()} user record${totalRows !== 1 ? "s" : ""} copied`,
              failed.length > 0 ? failed.map((r) => r.table).join(", ") + " failed" : undefined
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            phase("users", "error", "Failed to copy users", msg);
            errors.push(`Users: ${msg}`);
          } finally {
            client.release();
          }
        } else {
          phase("users", "skipped", "Users not copied");
        }

        // ── 12. Data — table by table ─────────────────────────────────────────
        if (options.tables) {
          phase("data", "running", "Starting data copy…");
          const client = await pool.connect();
          let dataErrors = 0;
          try {
            const tableOrder = await getTableCopyOrder(client, srcSchema);
            phase("data", "running", `Copying data — ${tableOrder.length} tables`);

            for (const { name: tname } of tableOrder) {
              emit({ type: "table_data", table: tname, status: "running" });
              const result = await copyTableData(client, srcSchema, dstSchema, tname);
              if (result.error) {
                emit({ type: "table_data", table: tname, status: "error", error: result.error });
                errors.push(`Data "${tname}": ${result.error}`);
                dataErrors++;
              } else {
                emit({ type: "table_data", table: tname, status: "done", rows: result.rows });
              }
            }

            phase(
              "data",
              dataErrors > 0 ? "error" : "done",
              dataErrors > 0
                ? `Data copy finished with ${dataErrors} error${dataErrors !== 1 ? "s" : ""}`
                : `Data copied — ${tableOrder.length} tables`,
              `${tableOrder.length - dataErrors} ok, ${dataErrors} failed`
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            phase("data", "error", "Data copy failed", msg);
            errors.push(`Data: ${msg}`);
          } finally {
            client.release();
          }
        }

        // ── Summary ───────────────────────────────────────────────────────────
        emit({ type: "summary", newProjectId: newProject.id, errors });

      } catch (err) {
        // Top-level unexpected error
        const msg = err instanceof Error ? err.message : String(err);
        phase("fatal", "error", "Unexpected error", msg);
        errors.push(msg);
        emit({ type: "summary", newProjectId: "", errors });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
