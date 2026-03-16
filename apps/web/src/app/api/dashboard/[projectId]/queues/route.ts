import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectPool } from "@/lib/project-db";

async function getProject(projectId: string) {
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return p ?? null;
}

// Queue names are prefixed: pb_<projectId_compact>_<name>
function queuePrefix(projectId: string) {
  return `pb_${projectId.replace(/-/g, "")}_`;
}

// GET /api/dashboard/[projectId]/queues — list queues + metrics
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
    const { rows: extRows } = await client.query(
      `SELECT 1 FROM pg_extension WHERE extname = 'pgmq'`
    );
    const installed = extRows.length > 0;
    if (!installed) return NextResponse.json({ installed: false, queues: [] });

    const prefix = queuePrefix(projectId);
    const { rows: queues } = await client.query(
      `SELECT queue_name FROM pgmq.list_queues() WHERE queue_name LIKE $1 ORDER BY queue_name`,
      [`${prefix}%`]
    );

    // Get metrics for each queue
    const queuesWithMetrics = await Promise.all(
      queues.map(async (q) => {
        try {
          const { rows: [metrics] } = await client.query(
            `SELECT * FROM pgmq.metrics($1)`,
            [q.queue_name]
          );
          return {
            name: q.queue_name.slice(prefix.length), // strip prefix for display
            fullName: q.queue_name,
            metrics: metrics ?? {},
          };
        } catch {
          return { name: q.queue_name.slice(prefix.length), fullName: q.queue_name, metrics: {} };
        }
      })
    );

    return NextResponse.json({ installed: true, queues: queuesWithMetrics });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}

// POST /api/dashboard/[projectId]/queues
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json() as {
    action: "install" | "create" | "drop" | "send" | "read" | "delete_msg" | "purge";
    queueName?: string;
    message?: Record<string, unknown>;
    msgId?: number;
    limit?: number;
    vt?: number; // visibility timeout seconds
  };

  const pool = getProjectPool(project.databaseUrl);
  const client = await pool.connect();
  try {
    if (body.action === "install") {
      await client.query(`CREATE EXTENSION IF NOT EXISTS pgmq`);
      return NextResponse.json({ ok: true });
    }

    const prefix = queuePrefix(projectId);
    const fullQueueName = body.queueName ? `${prefix}${body.queueName}` : "";

    if (body.action === "create") {
      if (!body.queueName) return NextResponse.json({ error: "queueName required" }, { status: 400 });
      await client.query(`SELECT pgmq.create($1)`, [fullQueueName]);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "drop") {
      if (!body.queueName) return NextResponse.json({ error: "queueName required" }, { status: 400 });
      await client.query(`SELECT pgmq.drop_queue($1)`, [fullQueueName]);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "send") {
      if (!body.queueName || !body.message) {
        return NextResponse.json({ error: "queueName and message required" }, { status: 400 });
      }
      const { rows: [{ send }] } = await client.query(
        `SELECT pgmq.send($1, $2::jsonb)`,
        [fullQueueName, JSON.stringify(body.message)]
      );
      return NextResponse.json({ msgId: send });
    }

    if (body.action === "read") {
      if (!body.queueName) return NextResponse.json({ error: "queueName required" }, { status: 400 });
      const vt = body.vt ?? 30;
      const limit = body.limit ?? 10;
      const { rows } = await client.query(
        `SELECT * FROM pgmq.read($1, $2, $3)`,
        [fullQueueName, vt, limit]
      );
      return NextResponse.json({ messages: rows });
    }

    if (body.action === "delete_msg") {
      if (!body.queueName || body.msgId == null) {
        return NextResponse.json({ error: "queueName and msgId required" }, { status: 400 });
      }
      await client.query(`SELECT pgmq.delete($1, $2)`, [fullQueueName, body.msgId]);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "purge") {
      if (!body.queueName) return NextResponse.json({ error: "queueName required" }, { status: 400 });
      const { rows: [{ purge_queue }] } = await client.query(
        `SELECT pgmq.purge_queue($1)`,
        [fullQueueName]
      );
      return NextResponse.json({ deleted: purge_queue });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  } finally {
    client.release();
    await pool.end();
  }
}
