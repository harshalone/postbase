/**
 * @swagger
 * /api/db/sql:
 *   post:
 *     summary: Execute a raw parameterized SQL query
 *     tags: [Database]
 *     description: Run an arbitrary parameterized SQL query against the project database. RLS context is enforced. Use $1, $2, … placeholders for params.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Postbase-Token
 *         required: false
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query:
 *                 type: string
 *               params:
 *                 type: array
 *                 items: {}
 *     responses:
 *       200:
 *         description: Query executed successfully
 *       400:
 *         description: Invalid payload or query error
 *       401:
 *         description: Missing or invalid API key
 */
import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { validateApiKey } from "@/lib/auth/keys";
import { verifyJwt, getJwtSecret } from "@/lib/auth/jwt";
import { getProjectSchema } from "@/lib/project-db";
import { z } from "zod";

const sqlSchema = z.object({
  query: z.string().min(1),
  params: z.array(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }
  const apiKey = authHeader.slice(7);
  const keyInfo = await validateApiKey(apiKey);
  if (!keyInfo) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = sqlSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { query, params = [] } = parsed.data;

  let userId: string | null = null;
  const sessionToken = req.headers.get("x-postbase-token") ?? req.headers.get("x-postbase-session");
  if (sessionToken) {
    try {
      const secret = getJwtSecret();
      const payload = await verifyJwt(sessionToken, secret);
      if (payload && payload.pid === keyInfo.projectId) {
        userId = payload.sub;
      }
    } catch {
      // ignore — fall back to anon role
    }
  }

  const client = await pool.connect();
  try {
    const schema = getProjectSchema(keyInfo.projectId);
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query("SELECT set_config('postbase.project_id', $1, true)", [keyInfo.projectId]);
    await client.query("SELECT set_config('postbase.role', $1, true)", [keyInfo.type]);
    if (userId) {
      await client.query("SELECT set_config('postbase.user_id', $1, true)", [userId]);
    }

    const result = await client.query(query, params as unknown[]);
    return Response.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    console.error("[db/sql] ERROR:", message);
    return Response.json({ error: message }, { status: 400 });
  } finally {
    await client.query("RESET search_path").catch(() => {});
    client.release();
  }
}
