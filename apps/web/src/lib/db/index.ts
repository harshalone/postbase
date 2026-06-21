import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});

// CRITICAL: a Pool with no "error" listener crashes the whole Node process via
// an uncaughtException when an *idle* client errors out — e.g. when Railway's
// Postgres service restarts and `postgres.railway.internal` briefly stops
// resolving (ENOTFOUND / "Connection terminated unexpectedly"). Handling it
// here keeps the web server alive so the /api/health check stays reachable;
// the next query simply reconnects.
pool.on("error", (err) => {
  console.error("[db] idle pool client error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema, logger: false });
export type DB = typeof db;
