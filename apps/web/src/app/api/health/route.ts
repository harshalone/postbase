/**
 * GET /api/health — health check endpoint
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET(_req: NextRequest) {
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json(
      { status: "ok", timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database unreachable";
    return Response.json(
      { status: "error", error: message, timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
