/**
 * @swagger
 * /api/rpc/{fn}:
 *   post:
 *     summary: Call a PostgreSQL function
 *     tags: [Database]
 *     description: Call a PostgreSQL function in the project's schema honoring RLS.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fn
 *         required: true
 *         description: The function name
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Postbase-Token
 *         required: false
 *         description: Optional access JWT that identifies the authenticated user for RLS.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               args:
 *                 type: object
 *                 description: Arguments to pass to the function
 *               count:
 *                 type: string
 *                 enum: [exact, planned, estimated]
 *                 description: Whether to count rows
 *     responses:
 *       200:
 *         description: Function executed successfully
 *       400:
 *         description: Invalid JSON or execution error
 *       401:
 *         description: Missing or invalid API key
 */
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { z } from "zod";
import { validateApiKey } from "@/lib/auth/keys";
import { verifyJwt, getJwtSecret } from "@/lib/auth/jwt";
import { getProjectSchema } from "@/lib/project-db";

const bodySchema = z.object({
  args: z.record(z.unknown()).optional(),
  count: z.enum(["exact", "planned", "estimated"]).optional(),
});

function sanitizeIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid function name: ${name}`);
  }
  return name;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ fn: string }> }) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }
  const keyInfo = await validateApiKey(authHeader.slice(7));
  if (!keyInfo) return Response.json({ error: "Invalid API key" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { fn: fnName } = await params;

  let fnSafe: string;
  try {
    fnSafe = sanitizeIdentifier(fnName);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }

  // Resolve user JWT for RLS
  let userId: string | null = null;
  const token = req.headers.get("x-postbase-token") ?? req.headers.get("x-postbase-session");
  if (token) {
    try {
      const payload = await verifyJwt(token, getJwtSecret());
      if (payload?.pid === keyInfo.projectId) userId = payload.sub;
    } catch {}
  }

  const args = parsed.data.args ?? {};
  const argKeys = Object.keys(args);
  const values: unknown[] = Object.values(args);

  // Build named argument list: schema.fn(key => $1, key2 => $2)
  const schema = getProjectSchema(keyInfo.projectId);
  const argList = argKeys.map((k, i) => `${k} => $${i + 1}`).join(", ");
  const sql = `SELECT * FROM ${schema}.${fnSafe}(${argList})`;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const client = await pool.connect();

  try {
    // Set RLS context
    await client.query("SELECT set_config('postbase.project_id', $1, true)", [keyInfo.projectId]);
    await client.query("SELECT set_config('postbase.role', $1, true)", [keyInfo.type]);
    if (userId) {
      await client.query("SELECT set_config('postbase.user_id', $1, true)", [userId]);
    }

    if (parsed.data.count === "exact") {
      const countResult = await client.query(`SELECT COUNT(*) FROM (${sql}) AS _rpc_count`, values);
      const total = parseInt(countResult.rows[0].count, 10);
      const result = await client.query(sql, values);
      return Response.json({ data: result.rows, count: total });
    }

    const result = await client.query(sql, values);
    return Response.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "RPC failed";
    return Response.json({ error: message }, { status: 400 });
  } finally {
    client.release();
  }
}

// HEAD support for count-only queries
export async function HEAD(req: NextRequest, { params }: { params: Promise<{ fn: string }> }) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return new Response(null, { status: 401 });
  const keyInfo = await validateApiKey(authHeader.slice(7));
  if (!keyInfo) return new Response(null, { status: 401 });

  const { fn: fnName } = await params;
  let fnSafe: string;
  try { fnSafe = sanitizeIdentifier(fnName); } catch {
    return new Response(null, { status: 400 });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('postbase.project_id', $1, true)", [keyInfo.projectId]);
    await client.query("SELECT set_config('postbase.role', $1, true)", [keyInfo.type]);
    const headSchema = getProjectSchema(keyInfo.projectId);
    const result = await client.query(`SELECT COUNT(*) FROM ${headSchema}.${fnSafe}()`);
    const count = result.rows[0].count;
    return new Response(null, { headers: { "X-Postbase-Count": count } });
  } catch {
    return new Response(null, { status: 400 });
  } finally {
    client.release();
  }
}
