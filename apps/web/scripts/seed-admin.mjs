#!/usr/bin/env node
/**
 * Seed the default admin user for the Postbase dashboard.
 * Idempotent — safe to run multiple times (uses ON CONFLICT DO NOTHING).
 *
 * Default credentials (user is prompted to change on first login):
 *   Email:    admin@getpostbase.com
 *   Password: postbase
 */

import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postbase:postbase@localhost:5432/postbase";

const ADMIN_EMAIL = "admin@getpostbase.com";
const ADMIN_PASSWORD = "postbase";

const pool = new Pool({ connectionString: DATABASE_URL });

try {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  await pool.query(
    `INSERT INTO _postbase.admin_users (email, password_hash, must_change_credentials)
     VALUES ($1, $2, false)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, must_change_credentials = false`,
    [ADMIN_EMAIL, passwordHash]
  );

  console.log("✔ Admin user ready:", ADMIN_EMAIL);
} catch (err) {
  console.error("✖ Failed to seed admin user:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
